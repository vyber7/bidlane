import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId, type Document } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { PrismaClient } from "@prisma/client";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, trigger: vi.fn() }));
const sessions = new AsyncLocalStorage<{ user: { email: string } } | null>();
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local engagement database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/libs/prismadb", () => ({ default: new Proxy({}, { get() { throw new Error("Engagement must not use Prisma 6"); } }) }));
vi.mock("@/app/actions/getSession", () => ({ getSession: async () => sessions.getStore() ?? null }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: state.trigger } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { POST as comment } from "@/app/api/comments/route";
import { POST as view } from "@/app/api/listing-view/route";
import { POST as watch } from "@/app/api/update-watchlist/route";
import getComments from "@/app/actions/getComments";
import * as provider from "@/app/libs/native-repositories";
import { makeListing } from "@/app/test/auction-fixtures";
import { parseListing } from "@/app/libs/listing-validation";
import { toPublicListing } from "@/app/libs/listing-payload";
import { TransactionRetryLimitError } from "./transaction-errors";

const image = "https://res.cloudinary.com/demo/image/upload/comment.jpg";
const request = (body: unknown) => new Request("http://localhost/api/engagement", { method: "POST", body: JSON.stringify(body) });
const asUser = <T>(user: AuthUser | null, operation: () => T): T => sessions.run(user ? { user: { email: user.email! } } : null, operation);
const url = process.env.NATIVE_TEST_DATABASE_URL;

describe.skipIf(!url)("native comments, listing views and watchlists on a local replica set", () => {
  let connection: DatabaseV8, repositories: NativeRepositories, legacy: PrismaClient;
  let seller: AuthUser, buyer: AuthUser, other: AuthUser, admin: AuthUser, listingId: string;
  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Engagement tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_engagement";
    const localUrl = parsed.toString();
    connection = createDatabaseV8(localUrl); state.connection = connection;
    await connection.mongoClient.connect(); await connection.database.dropDatabase();
    await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database);
    legacy = new PrismaClient({ datasourceUrl: localUrl });
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks(); state.trigger.mockResolvedValue(undefined);
    for (const collection of await connection.database.listCollections().toArray()) await connection.database.collection(collection.name).deleteMany({});
    vi.stubEnv("NEXTAUTH_SECRET", "local-engagement-test-secret"); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    seller = await repositories.users.create({ email: "seller@example.com", name: "Seller", emailVerified: new Date() });
    buyer = await repositories.users.create({ email: "buyer@example.com", name: "Buyer", emailVerified: new Date() });
    other = await repositories.users.create({ email: "other@example.com", name: null, emailVerified: new Date() });
    admin = await repositories.users.create({ email: "admin@example.com", name: "Admin", emailVerified: new Date() });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "ADMIN" } });
    const created = await repositories.listingAuthoring.create(seller.id, parseListing({ ...makeListing(), images: [image], vin: "", vehicleRecords: [], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "None known", modifications: "None known", knownFlaws: "None known" }), new Date("2026-01-01"));
    listingId = created.id;
    await setListing({ status: "LIVE", reservePrice: Long.fromNumber(90000), reviewNote: "Private seller feedback", futureSecret: "never publish" });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  afterAll(async () => {
    if (connection) { await legacy?.$disconnect(); await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);

  const listings = () => connection.database.collection("Listing");
  const users = () => connection.database.collection("User");
  const setListing = (fields: Record<string, unknown>) => listings().updateOne({ _id: new ObjectId(listingId) }, { $set: fields });
  const rawListing = () => listings().findOne({ _id: new ObjectId(listingId) }, { promoteLongs: false });
  const rawUser = (user = buyer) => users().findOne({ _id: new ObjectId(user.id) });
  const postComment = (actor = buyer, extra = {}) => asUser(actor, () => comment(request({ listingId, comment: " Great car ", ...extra })));
  const postView = (actor: AuthUser | null = buyer) => asUser(actor, () => view(request({ listingId, userId: seller.id })));
  const postWatch = (watching: boolean, actor = buyer) => asUser(actor, () => watch(request({ listingId, watching, userId: seller.id })));
  async function rejectWrites(collection: string, operation: () => Promise<void>) {
    await connection.database.command({ collMod: collection, validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { await operation(); } finally { await connection.database.command({ collMod: collection, validator: {} }); }
  }
  // Force an actual write conflict after the transaction's snapshot read. The
  // driver must retry the entire callback; quotas and live events must not retry.
  function changeAfterFirstRead(change: () => Promise<unknown>) {
    const original = provider.withNativeTransaction;
    let changed = false;
    vi.spyOn(provider, "withNativeTransaction").mockImplementation((operation, options) => original(async (tx) => {
      const find = tx.engagement.find;
      tx.engagement.find = async (id) => {
        const result = await find(id);
        if (!changed) { changed = true; await change(); }
        return result;
      };
      return operation(tx);
    }, options));
  }

  it("stores comment ObjectId relations, timestamps and the seller alert atomically with a public DTO", async () => {
    const before = await rawListing();
    const response = await postComment(); expect(response.status).toBe(201);
    const payload = (await response.json()).comment;
    expect(Object.keys(payload).sort()).toEqual(["id", "body", "image", "createdAt", "listingId", "user"].sort());
    expect(payload).toMatchObject({ body: "Great car", image: null, listingId, user: { name: "Buyer" } });
    const raw = await connection.database.collection("Comment").findOne({ _id: new ObjectId(payload.id) });
    expect(raw).toMatchObject({ listingId: new ObjectId(listingId), userId: new ObjectId(buyer.id), createdAt: new Date(payload.createdAt) });
    const listing = await rawListing();
    expect(listing?.lastCommentAt).toEqual(raw?.createdAt); expect(listing?.updatedAt).toEqual(raw?.createdAt);
    expect(listing?.commentsIds).toEqual(before?.commentsIds); expect(listing?.commenterIds).toEqual(before?.commenterIds);
    expect((await rawUser())?.listingsCommentedOnIds).toEqual([]);
    expect(await legacy.comment.findUnique({ where: { id: payload.id }, include: { user: { select: { name: true } } } })).toMatchObject({ body: "Great car", userId: buyer.id, listingId, user: { name: "Buyer" } });
    expect(await connection.database.collection("Notification").findOne({ userId: new ObjectId(seller.id) })).toMatchObject({ eventKey: `comment:${payload.id}`, readAt: null });
    expect(state.trigger).toHaveBeenCalledWith(`listing-${listingId}`, "new-comment", payload);
    expect(state.trigger).toHaveBeenCalledWith(`private-user-${seller.id}`, "notifications-changed", {});
  });

  it("does not alert a seller about their own comment", async () => {
    expect((await postComment(seller)).status).toBe(201);
    expect(await connection.database.collection("Notification").countDocuments()).toBe(0);
  });

  it.each(["Notification", "Listing"])("rolls back a comment and its timestamps when the %s write fails", async (collection) => {
    const before = await rawListing();
    await rejectWrites(collection, async () => { expect((await postComment()).status).toBe(500); });
    expect(await connection.database.collection("Comment").countDocuments()).toBe(0);
    expect(await connection.database.collection("Notification").countDocuments()).toBe(0);
    expect(await rawListing()).toEqual(before); expect(state.trigger).not.toHaveBeenCalled();
  });

  it("rechecks comment visibility after contention and never broadcasts an aborted comment", async () => {
    changeAfterFirstRead(() => setListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    expect((await postComment()).status).toBe(409);
    expect(await connection.database.collection("Comment").countDocuments()).toBe(0);
    expect(await connection.database.collection("Notification").countDocuments()).toBe(0);
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it("charges quotas and broadcasts only once when a comment transaction retries", async () => {
    changeAfterFirstRead(() => setListing({ description: "Concurrent seller edit" }));
    expect((await postComment()).status).toBe(201);
    expect(await connection.database.collection("Comment").countDocuments()).toBe(1);
    expect(await connection.database.collection("Notification").countDocuments()).toBe(1);
    const buckets = await connection.database.collection("AbuseQuota").find({}).toArray();
    expect(buckets).toHaveLength(3); expect(buckets.every((bucket) => Number(bucket.count) === 1)).toBe(true);
    expect(state.trigger.mock.calls.filter(([, event]) => event === "new-comment")).toHaveLength(1);
  });

  it("only attaches a photo owned by the author and valid for this listing", async () => {
    await repositories.assets.register({ id: "photo:other", userId: seller.id, kind: "PHOTO", listingId: null, url: image, bytes: 100, format: "jpg" });
    expect((await postComment(buyer, { image })).status).toBe(400);
    const ownImage = image.replace("comment.jpg", "buyer.jpg");
    await repositories.assets.register({ id: "photo:buyer", userId: buyer.id, kind: "PHOTO", listingId, url: ownImage, bytes: 100, format: "jpg" });
    const response = await postComment(buyer, { image: ownImage });
    expect(response.status).toBe(201); expect((await response.json()).comment.image).toBe(ownImage);
  });

  it("reads comments newest first with only author names, including missing and deleted authors", async () => {
    const base = { listingId: new ObjectId(listingId), body: null, image: null, futureSecret: "never publish" };
    await connection.database.collection("Comment").insertMany([
      { ...base, createdAt: new Date("2026-01-01"), userId: new ObjectId(buyer.id) },
      { ...base, createdAt: new Date("2026-01-02"), userId: new ObjectId(other.id) },
      { ...base, createdAt: new Date("2026-01-03"), userId: null },
      { ...base, createdAt: new Date("2026-01-04"), userId: new ObjectId() },
    ]);
    await users().updateOne({ _id: new ObjectId(buyer.id) }, { $set: { hashedPassword: "private hash", image: "private avatar", futureSecret: "secret" } });
    const result = await getComments(listingId);
    expect(result.map((item) => item.user)).toEqual([null, null, { name: null }, { name: "Buyer" }]);
    for (const item of result) expect(Object.keys(item).sort()).toEqual(["id", "body", "image", "createdAt", "listingId", "user"].sort());
    expect(result.map((item) => item.createdAt)).toEqual([4, 3, 2, 1].map((day) => new Date(`2026-01-0${day}`)));
  });

  it("leaves anonymous view counts and relationship arrays unchanged", async () => {
    const before = await rawListing();
    const response = await postView(null); expect(response.status).toBe(200); expect(await response.json()).toEqual({ views: 1 });
    expect(await rawListing()).toEqual(before); expect((await rawUser())?.seenListIds).toEqual([]);
  });

  it("counts concurrent visits by one authenticated user once on both sides", async () => {
    const results = await Promise.all([postView(), postView(), postView()]);
    expect(results.map((item) => item.status)).toEqual([200, 200, 200]);
    expect(await Promise.all(results.map((item) => item.json()))).toEqual([{ views: 2 }, { views: 2 }, { views: 2 }]);
    const raw = await rawListing(); expect(raw?.views).toEqual(Long.fromNumber(2)); expect(raw?.seenIds).toEqual([new ObjectId(buyer.id)]);
    expect((await rawUser())?.seenListIds).toEqual([new ObjectId(listingId)]);
    expect((await rawUser(seller))?.seenListIds).toEqual([]);
    expect(await legacy.listing.findUnique({ where: { id: listingId } })).toMatchObject({ views: 2, seenIds: [buyer.id] });
  });

  it("counts distinct users concurrently without exceeding the signed Int cap", async () => {
    await setListing({ views: Long.fromNumber(2_147_483_646) });
    const results = await Promise.all([postView(buyer), postView(other)]);
    expect(results.every((item) => item.status === 200)).toBe(true);
    expect(await Promise.all(results.map((item) => item.json()))).toEqual([{ views: 2_147_483_647 }, { views: 2_147_483_647 }]);
    const raw = await rawListing(); expect(raw?.views).toEqual(Long.fromNumber(2_147_483_647)); expect(raw?.seenIds).toHaveLength(1);
    expect([...(await rawUser())!.seenListIds, ...(await rawUser(other))!.seenListIds]).toEqual([new ObjectId(listingId)]);
  });

  it("rolls back the count and viewer array if the inverse User update fails", async () => {
    const before = await rawListing();
    await rejectWrites("User", async () => { expect((await postView()).status).toBe(500); });
    expect(await rawListing()).toEqual(before); expect((await rawUser())?.seenListIds).toEqual([]);
  });

  it("preserves private listing access for sellers and admins without exposing it to others", async () => {
    await setListing({ status: "UPCOMING", reviewStatus: "PENDING" });
    expect((await postView(null)).status).toBe(404); expect((await postView()).status).toBe(404);
    expect((await postView(seller)).status).toBe(200); expect((await postView(admin)).status).toBe(200);
    expect((await postComment(seller)).status).toBe(409); expect((await postWatch(true, admin)).status).toBe(404);
    expect((await rawListing())?.seenIds).toHaveLength(2); expect(state.trigger).not.toHaveBeenCalled();
  });

  it("rechecks view visibility after a concurrent moderation change", async () => {
    changeAfterFirstRead(() => setListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    expect((await postView()).status).toBe(404);
    expect((await rawListing())?.views).toEqual(Long.ONE); expect((await rawListing())?.seenIds).toEqual([]);
    expect((await rawUser())?.seenListIds).toEqual([]);
  });

  it.each(["missing", "null"])("matches Prisma 6 view filters for %s legacy fields", async (kind) => {
    const fieldUpdate = (field: string) => kind === "missing" ? { $unset: { [field]: "" } } : { $set: { [field]: null } };
    await listings().updateOne({ _id: new ObjectId(listingId) }, fieldUpdate("seenIds"));
    await users().updateOne({ _id: new ObjectId(buyer.id) }, fieldUpdate("seenListIds"));
    const response = await postView(); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ views: kind === "missing" ? 1 : 2 });
    expect((await legacy.user.findUnique({ where: { id: buyer.id } }))?.seenListIds).toEqual(kind === "missing" ? [] : [listingId]);
    await listings().updateOne({ _id: new ObjectId(listingId) }, { $set: { seenIds: [] } });
    await listings().updateOne({ _id: new ObjectId(listingId) }, fieldUpdate("views"));
    expect(await (await postView()).json()).toEqual({ views: kind === "missing" ? 1 : 2 });
    expect((await rawListing())?.seenIds).toEqual(kind === "missing" ? [] : [new ObjectId(buyer.id)]);
    await listings().updateOne({ _id: new ObjectId(listingId) }, { $set: { seenIds: [] } });
    // Verify the original v6 predicate against the same raw legacy counter.
    expect((await legacy.listing.updateMany({ where: { id: listingId, views: { lt: 2_147_483_647 }, NOT: { seenIds: { has: buyer.id } } }, data: { views: { increment: 1 } } })).count).toBe(kind === "missing" ? 0 : 1);
  });

  it("persists idempotent watch/unwatch intent on both sides without changing timestamps", async () => {
    const before = await rawListing(), userBefore = await rawUser();
    for (const watching of [true, true, false, false]) {
      expect((await postWatch(watching)).status).toBe(200);
      expect((await rawListing())?.watchersIds).toEqual(watching ? [new ObjectId(buyer.id)] : []);
      expect((await rawUser())?.watchListIds).toEqual(watching ? [new ObjectId(listingId)] : []);
    }
    expect((await rawListing())?.updatedAt).toEqual(before?.updatedAt); expect((await rawUser())?.updatedAt).toEqual(userBefore?.updatedAt);
    expect((await legacy.user.findUnique({ where: { id: buyer.id } }))?.watchListIds).toEqual([]);
  });

  it("preserves concurrent watchers and deduplicates repeated requests", async () => {
    const results = await Promise.all([postWatch(true), postWatch(true), postWatch(true, other)]);
    expect(results.every((item) => item.status === 200)).toBe(true);
    expect((await rawListing())?.watchersIds.map(String).sort()).toEqual([buyer.id, other.id].sort());
    expect((await rawUser())?.watchListIds).toEqual([new ObjectId(listingId)]);
    expect((await rawUser(other))?.watchListIds).toEqual([new ObjectId(listingId)]);
    expect((await postWatch(false)).status).toBe(200);
    expect((await rawListing())?.watchersIds).toEqual([new ObjectId(other.id)]);
  });

  it("keeps opposite concurrent watch intents consistent across both documents", async () => {
    const results = await Promise.all([postWatch(true), postWatch(false)]);
    expect(results.every((item) => item.status === 200)).toBe(true);
    const watching = (await rawListing())!.watchersIds.some((id: ObjectId) => id.equals(buyer.id));
    expect((await rawUser())?.watchListIds).toEqual(watching ? [new ObjectId(listingId)] : []);
  });

  it("initializes missing watch arrays as Prisma's connect did", async () => {
    await listings().updateOne({ _id: new ObjectId(listingId) }, { $unset: { watchersIds: "" } });
    await users().updateOne({ _id: new ObjectId(buyer.id) }, { $unset: { watchListIds: "" } });
    expect((await postWatch(true)).status).toBe(200);
    expect((await rawListing())?.watchersIds).toEqual([new ObjectId(buyer.id)]);
    expect((await rawUser())?.watchListIds).toEqual([new ObjectId(listingId)]);
  });

  it.each(["Listing", "User"])("rolls back rather than rewriting a malformed null %s watch array", async (collection) => {
    const field = collection === "Listing" ? "watchersIds" : "watchListIds";
    const id = collection === "Listing" ? listingId : buyer.id;
    await connection.database.collection(collection).updateOne({ _id: new ObjectId(id) }, { $set: { [field]: null } });
    const before = await rawListing(), userBefore = await rawUser();
    expect((await postWatch(true)).status).toBe(500);
    expect(await rawListing()).toEqual(before); expect(await rawUser()).toEqual(userBefore); expect(state.trigger).not.toHaveBeenCalled();
  });

  it("rolls back the listing's watcher array if the inverse User write fails", async () => {
    await rejectWrites("User", async () => { expect((await postWatch(true)).status).toBe(500); });
    expect((await rawListing())?.watchersIds).toEqual([]); expect((await rawUser())?.watchListIds).toEqual([]);
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it("rechecks watchlist visibility on a transaction retry", async () => {
    changeAfterFirstRead(() => setListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    expect((await postWatch(true)).status).toBe(404);
    expect((await rawListing())?.watchersIds).toEqual([]); expect((await rawUser())?.watchListIds).toEqual([]);
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it("matches the public Prisma snapshot, including legacy defaults, without returning private fields", async () => {
    await listings().updateOne({ _id: new ObjectId(listingId) }, { $unset: { views: "", isFeatured: "", lastCommentAt: "", updatedAt: "", reservePrice: "", images: "" }, $set: { watchersIds: [new ObjectId(buyer.id), new ObjectId(other.id)] } });
    const snapshot = (await repositories.engagement.watchSnapshot(listingId, buyer.id))!;
    expect(snapshot.listing).toEqual(toPublicListing((await legacy.listing.findUnique({ where: { id: listingId } }))!, buyer.id));
    for (const field of ["reservePrice", "watchersIds", "seenIds", "reviewNote", "futureSecret"]) expect(snapshot.listing).not.toHaveProperty(field);
    expect((await postWatch(true)).status).toBe(200);
    for (const [channel, event, payload] of state.trigger.mock.calls) {
      if (channel.startsWith("private-")) {
        if (event === "watching-update") expect(payload.listing).toMatchObject({ isNoReserve: true, isWatching: true, watcherCount: 2 });
      } else expect(payload).toEqual({ listingId, watcherCount: 2 });
      expect(JSON.stringify(payload)).not.toContain("never publish"); expect(JSON.stringify(payload)).not.toContain(other.id);
    }
  });

  it("loads only the viewer's public watchlist in updatedAt order with the same visibility as Prisma 6", async () => {
    await setListing({ watchersIds: [new ObjectId(buyer.id)], updatedAt: new Date("2026-01-03") });
    const base = (await rawListing())!;
    const approved = new ObjectId(), ended = new ObjectId();
    const missingStatus: Document = { ...base, _id: new ObjectId(), reviewStatus: "APPROVED" };
    delete missingStatus.status;
    await listings().insertMany([
      { ...base, _id: approved, status: "UPCOMING", reviewStatus: "APPROVED", updatedAt: new Date("2026-01-02") },
      { ...base, _id: ended, status: "ENDED", reviewStatus: null, updatedAt: new Date("2026-01-01") },
      { ...base, _id: new ObjectId(), status: "UPCOMING", reviewStatus: "PENDING" },
      { ...base, _id: new ObjectId(), watchersIds: [new ObjectId(other.id)] },
      missingStatus,
    ]);
    const result = await repositories.engagement.watchlist(buyer.id);
    expect(result.map((item) => item.id)).toEqual([listingId, approved.toHexString(), ended.toHexString()]);
    const previous = await legacy.listing.findMany({ where: { watchersIds: { has: buyer.id }, OR: [{ status: { in: ["LIVE", "ENDED"] } }, { status: "UPCOMING", reviewStatus: "APPROVED" }] }, orderBy: { updatedAt: "desc" } });
    expect(result).toEqual(previous.map((item) => toPublicListing(item, buyer.id)));
    expect(JSON.stringify(result)).not.toContain("never publish"); expect(JSON.stringify(result)).not.toContain("Private seller feedback");
  });

  it("returns success after committed comment/watch writes even if live delivery fails", async () => {
    state.trigger.mockRejectedValue(new Error("Offline"));
    expect((await postComment()).status).toBe(201); expect((await postWatch(true)).status).toBe(200);
    expect(await connection.database.collection("Comment").countDocuments()).toBe(1);
    expect((await rawListing())?.watchersIds).toEqual([new ObjectId(buyer.id)]);
  });

  it.each(["comment", "view", "watch"])("returns a retryable JSON response after exhausted %s contention", async (action) => {
    vi.spyOn(provider, "withNativeTransaction").mockRejectedValue(new TransactionRetryLimitError());
    const response = await (action === "comment" ? postComment() : action === "view" ? postView() : postWatch(true));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "The listing is busy. Please try again." });
    expect(state.trigger).not.toHaveBeenCalled();
  });
});
