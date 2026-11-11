import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, send: vi.fn(), trigger: vi.fn() }));
const sessions = new AsyncLocalStorage<{ user: { email: string } } | null>();
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local notification database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/actions/getSession", () => ({ getSession: async () => sessions.getStore() ?? null }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: state.trigger } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/app/libs/outbid-email", async (original) => ({ ...await original<typeof import("@/app/libs/outbid-email")>(), sendEmail: state.send, sendOutbidEmail: state.send }));
import { GET, PATCH } from "@/app/api/notifications/route";
import { getNotificationFeed } from "@/app/account/lib/notifications";
import { sendNotificationEmails } from "@/app/libs/notification-email-delivery";
import { buildOutbidEmail, EmailProviderError } from "@/app/libs/outbid-email";
import * as provider from "@/app/libs/native-repositories";
import { makeListing } from "@/app/test/auction-fixtures";

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("native notification reads and delivery on a local replica set", () => {
  let connection: DatabaseV8, repositories: NativeRepositories;
  let buyer: AuthUser, other: AuthUser, listingId: string;
  const createdAt = new Date("2026-01-01T12:00:00Z");
  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Notification tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_notifications";
    const localUrl = parsed.toString();
    connection = createDatabaseV8(localUrl); state.connection = connection;
    await connection.mongoClient.connect(); await connection.database.dropDatabase(); await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database);
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks(); state.send.mockResolvedValue("local-provider-id"); state.trigger.mockResolvedValue(undefined);
    for (const item of await connection.database.listCollections().toArray()) await connection.database.collection(item.name).deleteMany({});
    vi.stubEnv("RESEND_API_KEY", "local-test-no-email-sent"); vi.stubEnv("EMAIL_FROM", "alerts@bidlane.net"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
    buyer = await repositories.users.create({ email: "buyer@example.com", name: "Buyer", emailVerified: new Date() });
    other = await repositories.users.create({ email: "other@example.com", name: "Other", emailVerified: new Date() });
    listingId = new ObjectId().toHexString();
    const listing = makeListing({ id: listingId, userId: other.id, highestBidderId: other.id, auctionEndsAt: new Date(Date.now() + 3600_000) });
    const { id, ...fields } = listing;
    await connection.database.collection("Listing").insertOne({ ...fields, _id: new ObjectId(id), userId: new ObjectId(other.id), highestBidderId: new ObjectId(other.id), watchersIds: [new ObjectId(buyer.id)], biddersIds: [] });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  afterAll(async () => {
    if (connection) { await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);
  const collection = () => connection.database.collection("Notification");
  const oid = (index: number) => new ObjectId(index.toString(16).padStart(24, "0"));
  const record = (index: number, owner = buyer) => ({ _id: oid(index), userId: new ObjectId(owner.id), eventKey: `fixture:${index}`, kind: "bid", title: "Outbid", message: "A new bid", href: "/listing/car", actionLabel: "Open", tone: "warning", createdAt, readAt: null, emailPayload: { secret: "private payload" }, emailLockToken: "private lease", futureSecret: "private metadata" });
  const get = (query = "") => sessions.run({ user: { email: buyer.email! } }, () => GET(new Request(`http://localhost/api/notifications${query}`)));
  const mark = (body: unknown) => sessions.run({ user: { email: buyer.email! } }, () => PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify(body) })));
  const raw = (id: string) => collection().findOne({ _id: new ObjectId(id) }, { promoteLongs: false });
  const update = (id: string, fields: Record<string, unknown>) => collection().updateOne({ _id: new ObjectId(id) }, { $set: fields });
  const updateListing = (fields: Record<string, unknown>) => connection.database.collection("Listing").updateOne({ _id: new ObjectId(listingId) }, { $set: fields });
  async function queue(eventKey = "outbid:fixture") {
    await repositories.notifications.insertOnce({ userId: buyer.id, eventKey, kind: "bid", title: "Outbid", message: "A new bid", href: `/listing/${listingId}`, actionLabel: "Open", tone: "warning", createdAt, emailListingId: listingId });
    return (await collection().findOne({ userId: new ObjectId(buyer.id), eventKey }))!._id.toHexString();
  }

  it("paginates equal timestamps without gaps or duplicates and keeps read anchors valid", async () => {
    await collection().insertMany([...Array.from({ length: 103 }, (_, index) => record(index + 1)), record(500, other)]);
    const first = await (await get(`?view=unread&userId=${other.id}`)).json();
    expect(first.total).toBe(103); expect(first.unreadCount).toBe(103); expect(first.items).toHaveLength(50); expect(first.nextCursor).toBe(oid(54).toHexString());
    expect(await (await mark({ ids: [first.nextCursor] })).json()).toEqual({ updated: 1 });
    const second = await (await get(`?view=unread&cursor=${first.nextCursor}`)).json();
    const third = await getNotificationFeed(buyer.id, { cursor: second.nextCursor, unreadOnly: true });
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(Array.from({ length: 103 }, (_, index) => oid(103 - index).toHexString()));
    expect(third.nextCursor).toBeNull(); expect(third.unreadCount).toBe(102);
    const publicKeys = ["id", "kind", "title", "message", "createdAt", "readAt", "href", "actionLabel", "tone"].sort();
    for (const item of [...first.items, ...second.items, ...third.items]) expect(Object.keys(item).sort()).toEqual(publicKeys);
    expect(JSON.stringify(first)).not.toContain("private");
    expect((await get()).headers.get("cache-control")).toBe("private, no-store");
    expect(await (await get("?summary=1")).json()).toEqual({ userId: buyer.id, unreadCount: 102 });
    expect((await get(`?cursor=${oid(500)}`)).status).toBe(400);
  });

  it("marks only owned unread IDs, and cutoff reads leave newer arrivals untouched", async () => {
    await collection().insertMany([record(1), record(2), record(3, other), { ...record(4), createdAt: new Date(createdAt.getTime() + 1) }]);
    expect(await (await mark({ ids: [oid(1).toHexString(), oid(1).toHexString(), oid(3).toHexString()], userId: other.id })).json()).toEqual({ updated: 1 });
    const firstRead = (await raw(oid(1).toHexString()))!.readAt;
    expect(await (await mark({ ids: [oid(1).toHexString()] })).json()).toEqual({ updated: 0 });
    expect(state.trigger).toHaveBeenCalledTimes(1);
    expect(await (await mark({ all: true, before: createdAt.toISOString() })).json()).toEqual({ updated: 1 });
    expect((await raw(oid(1).toHexString()))?.readAt).toEqual(firstRead);
    expect((await raw(oid(3).toHexString()))?.readAt).toBeNull(); expect((await raw(oid(4).toHexString()))?.readAt).toBeNull();
    for (const [channel, event, payload] of state.trigger.mock.calls) expect([channel, event, payload]).toEqual([`private-user-${buyer.id}`, "notifications-changed", {}]);
  });

  it("keeps missing readAt outside unread counts and writes, matching Prisma's explicit-null filter", async () => {
    await collection().insertMany([record(1), record(2)]); await collection().updateOne({ _id: oid(2) }, { $unset: { readAt: "" } });
    const feed = await getNotificationFeed(buyer.id); expect(feed.total).toBe(2); expect(feed.unreadCount).toBe(1); expect(feed.items.every((item) => item.readAt === null)).toBe(true);
    expect(await repositories.notifications.unreadCount(buyer.id)).toBe(1);
    expect(await (await mark({ all: true, before: createdAt.toISOString() })).json()).toEqual({ updated: 1 });
    expect(await raw(oid(2).toHexString())).not.toHaveProperty("readAt");
  });

  it("does not broadcast a read that failed to persist", async () => {
    await collection().insertOne(record(1));
    await connection.database.command({ collMod: "Notification", validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { expect((await mark({ ids: [oid(1).toHexString()] })).status).toBe(500); }
    finally { await connection.database.command({ collMod: "Notification", validator: {} }); }
    expect((await raw(oid(1).toHexString()))?.readAt).toBeNull(); expect(state.trigger).not.toHaveBeenCalled();
  });

  it("freezes the payload before provider HTTP, preserves BSON types, and records acceptance", async () => {
    const id = await queue();
    state.send.mockImplementation(async (_key, payload) => {
      const saved = (await raw(id))!;
      expect(saved.emailStatus).toBe("SENDING"); expect(saved.emailPayload).toEqual(payload); expect(saved.emailFirstAttemptAt).toBeInstanceOf(Date); expect(saved.emailLockToken).toEqual(expect.any(String));
      return "accepted";
    });
    expect(await sendNotificationEmails()).toMatchObject({ checked: 1, sent: 1, failed: 0 });
    const saved = (await raw(id))!;
    expect(saved.userId).toEqual(new ObjectId(buyer.id)); expect(saved.emailListingId).toEqual(new ObjectId(listingId)); expect(saved.emailAttempts).toEqual(Long.ONE);
    expect(saved).toMatchObject({ emailStatus: "SENT", emailProviderId: "accepted", emailLockToken: null, emailLockedUntil: null });
    expect(state.send).toHaveBeenCalledWith("local-test-no-email-sent", saved.emailPayload, id);
    expect(await connection.database.collection("Notification").findOne({ _id: new ObjectId(id) }, { promoteLongs: false })).toMatchObject({ userId: new ObjectId(buyer.id), emailListingId: new ObjectId(listingId), emailAttempts: Long.ONE, emailStatus: "SENT" });
    expect(Object.keys((await repositories.notificationEmails.find(id))!.user!).sort()).toEqual(["email", "outbidEmailsEnabled", "endingSoonEmailsEnabled"].sort());
  });

  it("lets only one competing worker deliver a notification", async () => {
    await queue();
    const summaries = await Promise.all([sendNotificationEmails(), sendNotificationEmails()]);
    expect(summaries.reduce((sum, item) => sum + item.checked, 0)).toBe(1); expect(summaries.reduce((sum, item) => sum + item.sent, 0)).toBe(1); expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("fences stale preparation and completion after an expired lease is reclaimed", async () => {
    const id = await queue(), now = new Date();
    await update(id, { emailNextAttemptAt: new Date(0) });
    expect(await repositories.notificationEmails.claim(id, new Date(now.getTime() - 120_001), "stale")).toEqual({ count: 1 });
    expect(await repositories.notificationEmails.claim(id, now, "current")).toEqual({ count: 1 });
    const payload = buildOutbidEmail({ from: "alerts@bidlane.net", to: buyer.email!, origin: "https://bidlane.net", vehicle: "Car", listingId });
    expect(await repositories.notificationEmails.prepare(id, "stale", payload, now)).toEqual({ count: 0 });
    expect(await repositories.notificationEmails.finish(id, "stale", { emailStatus: "SENT", emailLastError: null })).toEqual({ count: 0 });
    expect((await raw(id))?.emailLockToken).toBe("current"); expect((await raw(id))?.emailPayload).toBeNull(); expect((await raw(id))?.emailAttempts).toEqual(Long.fromNumber(2));
  });

  it("waits for retry eligibility and reuses exactly the frozen payload and provider key", async () => {
    const id = await queue(); state.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    expect(await sendNotificationEmails()).toMatchObject({ retried: 1 }); const frozen = (await raw(id))!;
    expect(frozen.emailStatus).toBe("PENDING"); expect(frozen.emailNextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 55_000);
    expect(await sendNotificationEmails()).toMatchObject({ checked: 0 }); expect(state.send).toHaveBeenCalledTimes(1);
    vi.stubEnv("EMAIL_FROM", "changed@example.com"); vi.stubEnv("NEXTAUTH_URL", "https://changed.example"); vi.stubEnv("RESEND_API_KEY", "changed-key");
    await update(id, { emailNextAttemptAt: new Date(0) }); await updateListing({ status: "ENDED" });
    expect(await sendNotificationEmails()).toMatchObject({ sent: 1 });
    expect(state.send.mock.calls[1]).toEqual(["changed-key", frozen.emailPayload, id]); expect((await raw(id))?.emailFirstAttemptAt).toEqual(frozen.emailFirstAttemptAt);
  });

  it("recovers provider acceptance followed by a database failure without changing the request", async () => {
    const id = await queue(), original = provider.getNativeRepositories; let fail = true;
    vi.spyOn(provider, "getNativeRepositories").mockImplementation(() => {
      const result = original(), finish = result.notificationEmails.finish;
      result.notificationEmails.finish = async (...args) => { if (fail && args[2].emailStatus === "SENT") throw new Error("Local completion fault"); return finish(...args); };
      return result;
    });
    expect(await sendNotificationEmails()).toMatchObject({ failed: 1 }); const frozen = (await raw(id))!;
    expect(frozen.emailStatus).toBe("SENDING"); expect(frozen.emailPayload).not.toBeNull();
    expect(await sendNotificationEmails()).toMatchObject({ checked: 0 });
    fail = false; await update(id, { emailLockedUntil: new Date(0) });
    expect(await sendNotificationEmails()).toMatchObject({ sent: 1 });
    expect(state.send.mock.calls[1]).toEqual(state.send.mock.calls[0]); expect((await raw(id))?.emailFirstAttemptAt).toEqual(frozen.emailFirstAttemptAt);
  });

  it.each(["disabled", "no-email", "read", "leading", "ended", "expired"])("skips a %s outbid alert before sending", async (scenario) => {
    const id = await queue();
    if (scenario === "disabled") await connection.database.collection("User").updateOne({ _id: new ObjectId(buyer.id) }, { $set: { outbidEmailsEnabled: false } });
    if (scenario === "no-email") await connection.database.collection("User").updateOne({ _id: new ObjectId(buyer.id) }, { $set: { email: null } });
    if (scenario === "read") await update(id, { readAt: new Date() });
    if (scenario === "leading") await updateListing({ highestBidderId: new ObjectId(buyer.id) });
    if (scenario === "ended") await updateListing({ status: "ENDED" });
    if (scenario === "expired") await updateListing({ auctionEndsAt: new Date(0) });
    expect(await sendNotificationEmails()).toMatchObject({ skipped: 1 }); expect(state.send).not.toHaveBeenCalled(); expect((await raw(id))?.emailStatus).toBe("SKIPPED");
  });

  it("rechecks reminder membership on retry while preserving its frozen content and key", async () => {
    const id = await queue(`ending-soon:${listingId}`); state.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    expect(await sendNotificationEmails()).toMatchObject({ retried: 1 }); const frozen = (await raw(id))!;
    expect(state.send.mock.calls[0][2]).toBe(`ending-soon/${id}`);
    await update(id, { emailNextAttemptAt: new Date(0) }); await updateListing({ watchersIds: [] });
    expect(await sendNotificationEmails()).toMatchObject({ skipped: 1 }); expect(state.send).toHaveBeenCalledTimes(1); expect((await raw(id))?.emailPayload).toEqual(frozen.emailPayload);
  });

  it("honors reminder preferences independently of outbid preferences", async () => {
    await queue(`ending-soon:${listingId}`);
    await connection.database.collection("User").updateOne({ _id: new ObjectId(buyer.id) }, { $set: { outbidEmailsEnabled: false, endingSoonEmailsEnabled: true } });
    expect(await sendNotificationEmails()).toMatchObject({ sent: 1 });
    await queue(`ending-soon:${listingId}:disabled`);
    await connection.database.collection("User").updateOne({ _id: new ObjectId(buyer.id) }, { $set: { endingSoonEmailsEnabled: false } });
    expect(await sendNotificationEmails()).toMatchObject({ skipped: 1 }); expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("stops after a rate limit and preserves the provider's retry delay", async () => {
    const first = await queue("outbid:first"), second = await queue("outbid:second");
    await update(second, { createdAt: new Date(createdAt.getTime() + 1) });
    state.send.mockRejectedValueOnce(new EmailProviderError("rate_limit_exceeded", true, 120_000, true));
    expect(await sendNotificationEmails()).toMatchObject({ checked: 1, retried: 1, hasMore: true });
    expect((await raw(first))!.emailNextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 115_000);
    expect((await raw(second))?.emailAttempts).toEqual(Long.ZERO); expect(state.send).toHaveBeenCalledTimes(1);
  });

  it.each(["window", "recipient", "attempts"])("does not resend after a %s guard fails", async (kind) => {
    const id = await queue();
    const payload = buildOutbidEmail({ from: "alerts@bidlane.net", to: kind === "recipient" ? "old@example.com" : buyer.email!, origin: "https://bidlane.net", vehicle: "Car", listingId });
    await update(id, { emailPayload: payload, emailFirstAttemptAt: kind === "window" ? new Date(Date.now() - 23 * 3600_000) : new Date(), emailAttempts: Long.fromNumber(kind === "attempts" ? 8 : 1) });
    expect(await sendNotificationEmails()).toMatchObject(kind === "recipient" ? { skipped: 1 } : { failed: 1 }); expect(state.send).not.toHaveBeenCalled();
    expect((await raw(id))?.emailLockToken).toBeNull();
  });

  it.each([false, true])("stops terminal provider errors (retryable=%s) at the eighth attempt", async (retryable) => {
    const id = await queue(); await update(id, { emailAttempts: Long.fromNumber(7) });
    state.send.mockRejectedValueOnce(new EmailProviderError(retryable ? "network_error" : "validation_error", retryable));
    expect(await sendNotificationEmails()).toMatchObject({ failed: 1, retried: 0 }); expect((await raw(id))?.emailStatus).toBe("FAILED"); expect((await raw(id))?.emailAttempts).toEqual(Long.fromNumber(8));
  });

  it.each(["missing", "null"])("preserves default email preferences for %s legacy fields", async (kind) => {
    const id = await queue();
    await connection.database.collection("User").updateOne({ _id: new ObjectId(buyer.id) }, kind === "missing" ? { $unset: { outbidEmailsEnabled: "", endingSoonEmailsEnabled: "" } } : { $set: { outbidEmailsEnabled: null, endingSoonEmailsEnabled: null } });
    expect((await repositories.notificationEmails.find(id))?.user).toEqual({ email: buyer.email, outbidEmailsEnabled: true, endingSoonEmailsEnabled: true });
    expect(await sendNotificationEmails()).toMatchObject({ sent: 1 });
  });

  it.each(["PENDING", "SENDING"] as const)("excludes missing and includes explicit-null eligibility dates for %s jobs", async (status) => {
    const id = await queue(), field = status === "PENDING" ? "emailNextAttemptAt" : "emailLockedUntil", now = new Date();
    for (const kind of ["missing", "null"]) {
      await update(id, { emailStatus: status });
      await collection().updateOne({ _id: new ObjectId(id) }, kind === "missing" ? { $unset: { [field]: "" } } : { $set: { [field]: null } });
      const candidates = await repositories.notificationEmails.candidates(now, 20);
      expect(candidates).toEqual(kind === "missing" ? [] : [{ id }]);
    }
  });

  it.each(["missing", "null"])("preserves Prisma's increment/read behavior for a %s attempt counter", async (kind) => {
    const id = await queue();
    await collection().updateOne({ _id: new ObjectId(id) }, kind === "missing" ? { $unset: { emailAttempts: "" } } : { $set: { emailAttempts: null } });
    expect(await repositories.notificationEmails.claim(id, new Date(), "legacy")).toEqual({ count: 1 });
    expect((await raw(id))?.emailAttempts).toBeNull(); expect(await repositories.notificationEmails.attempts(id)).toBe(0);
    expect((await repositories.notificationEmails.find(id))?.emailAttempts).toBe(0);
  });
});
