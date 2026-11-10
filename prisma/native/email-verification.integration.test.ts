import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { PrismaClient } from "@prisma/client";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, fetch: vi.fn() }));
const sessions = new AsyncLocalStorage<{ user: { email: string } } | null>();
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local verification database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/libs/prismadb", () => ({ default: new Proxy({}, { get() { throw new Error("Email verification must not use Prisma 6"); } }) }));
vi.mock("@/app/actions/getSession", () => ({ getSession: async () => sessions.getStore() ?? null }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { POST as requestVerification } from "@/app/api/account/verify-email/route";
import { POST as confirm } from "@/app/api/verify-email/route";
import { verificationHash } from "@/app/libs/email-verification";
import * as provider from "@/app/libs/native-repositories";
import { TransactionRetryLimitError } from "./transaction-errors";

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("native email verification on a local replica set", () => {
  let connection: DatabaseV8, repositories: NativeRepositories, legacy: PrismaClient, user: AuthUser;
  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Verification tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_verification";
    const localUrl = parsed.toString();
    connection = createDatabaseV8(localUrl); state.connection = connection;
    await connection.mongoClient.connect(); await connection.database.dropDatabase(); await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database); legacy = new PrismaClient({ datasourceUrl: localUrl });
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const item of await connection.database.listCollections().toArray()) await connection.database.collection(item.name).deleteMany({});
    vi.stubEnv("RESEND_API_KEY", "local-test-no-email-sent"); vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
    vi.stubGlobal("fetch", state.fetch); state.fetch.mockImplementation(async () => Response.json({ id: "local-mail" }));
    user = await repositories.users.create({ email: "proof@example.com", name: "Proof", emailVerified: null });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  afterAll(async () => {
    if (connection) { await legacy?.$disconnect(); await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);
  const records = () => connection.database.collection("EmailVerification");
  const request = () => sessions.run({ user: { email: user.email! } }, () => requestVerification());
  const redeem = (token: string) => confirm(new Request("http://localhost/api/verify-email", { method: "POST", body: JSON.stringify({ token }) }));
  const tokenFromMail = (index = 0): string => {
    const body = JSON.parse(state.fetch.mock.calls[index][1].body);
    return new URLSearchParams(new URL(body.text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get("token")!;
  };
  const saved = () => records().findOne({ _id: new ObjectId(user.id) });
  const account = () => connection.database.collection("User").findOne({ _id: new ObjectId(user.id) });
  async function rejectWrites(collection: string, operation: () => Promise<void>) {
    await connection.database.command({ collMod: collection, validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { await operation(); } finally { await connection.database.command({ collMod: collection, validator: {} }); }
  }

  it("commits an ObjectId-keyed hash and expiry before emailing only the authenticated address", async () => {
    state.fetch.mockImplementation(async () => { expect(await saved()).not.toBeNull(); return Response.json({ id: "local-mail" }); });
    expect((await request()).status).toBe(200);
    const token = tokenFromMail(), record = (await saved())!;
    expect(token).toMatch(/^[a-f0-9]{64}$/); expect(record.tokenHash).toBe(verificationHash(token));
    expect(record._id).toEqual(new ObjectId(user.id)); expect(record.email).toBe(user.email);
    expect(record.expiresAt.getTime() - record.requestedAt.getTime()).toBe(30 * 60_000);
    expect(JSON.stringify(record)).not.toContain(token);
    const body = JSON.parse(state.fetch.mock.calls[0][1].body), link = new URL(body.text.match(/https:\/\/\S+/)[0]);
    expect(body.to).toEqual([user.email]); expect(link.origin + link.pathname).toBe("https://bidlane.net/verify-email"); expect(link.search).toBe("");
    expect(await legacy.emailVerification.findUnique({ where: { id: user.id } })).toMatchObject({ id: user.id, email: user.email, tokenHash: verificationHash(token) });
    await expect(records().insertOne({ ...record, _id: new ObjectId() })).rejects.toMatchObject({ code: 11000 });
  });

  it("sends once and returns cooldown for concurrent first requests", async () => {
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 429]); expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(await records().countDocuments()).toBe(1);
  });

  it("rotates an older token exactly once during concurrent resends", async () => {
    await request(); const oldToken = tokenFromMail();
    await records().updateOne({ _id: new ObjectId(user.id) }, { $set: { requestedAt: new Date(Date.now() - 61_000) } });
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 429]); expect(state.fetch).toHaveBeenCalledTimes(2);
    expect((await redeem(oldToken)).status).toBe(400); expect((await redeem(tokenFromMail(1))).status).toBe(200);
  });

  it("consumes a token and updates emailVerified/updatedAt atomically, with one winner for a replay race", async () => {
    await request(); const token = tokenFromMail(), before = (await account())!;
    const responses = await Promise.all([redeem(token), redeem(token)]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 400]); expect(await saved()).toBeNull();
    const verified = (await account())!;
    expect(verified.emailVerified).toBeInstanceOf(Date); expect(verified.updatedAt).toEqual(verified.emailVerified); expect(verified.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect((await legacy.user.findUnique({ where: { id: user.id } }))?.emailVerified).toEqual(verified.emailVerified);
    expect((await redeem(token)).status).toBe(400);
  });

  it.each(["changed", "deleted"])("rejects proof for a %s account and rolls back token consumption", async (kind) => {
    await request(); const token = tokenFromMail(), before = await saved();
    if (kind === "changed") await connection.database.collection("User").updateOne({ _id: new ObjectId(user.id) }, { $set: { email: "changed@example.com" } });
    else await connection.database.collection("User").deleteOne({ _id: new ObjectId(user.id) });
    expect((await redeem(token)).status).toBe(400); expect(await saved()).toEqual(before);
    if (kind === "changed") expect((await account())?.emailVerified).toBeNull();
  });

  it("rolls back token consumption on a failed account write, then permits retry", async () => {
    await request(); const token = tokenFromMail(), before = await saved();
    await rejectWrites("User", async () => { expect((await redeem(token)).status).toBe(503); });
    expect(await saved()).toEqual(before); expect((await account())?.emailVerified).toBeNull();
    expect((await redeem(token)).status).toBe(200);
  });

  it("never contacts the provider if storing the request fails", async () => {
    await rejectWrites("EmailVerification", async () => { expect((await request()).status).toBe(503); });
    expect(await saved()).toBeNull(); expect(state.fetch).not.toHaveBeenCalled();
  });

  it("retains cooldown after provider rejection without exposing provider details", async () => {
    state.fetch.mockImplementation(async () => Response.json({ message: "private provider details" }, { status: 403 }));
    const response = await request(); expect(response.status).toBe(502); expect(await response.text()).not.toContain("private provider");
    expect(await saved()).not.toBeNull(); expect((await request()).status).toBe(429); expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("emails once after a transaction retry using the hash that actually committed", async () => {
    await repositories.emailVerifications.replace({ id: user.id, email: user.email!, tokenHash: verificationHash("a".repeat(64)), requestedAt: new Date(Date.now() - 61_000), expiresAt: new Date(Date.now() + 60_000) });
    const original = provider.withNativeTransaction; let changed = false;
    vi.spyOn(provider, "withNativeTransaction").mockImplementation((operation, options) => original(async (tx) => {
      const find = tx.emailVerifications.find;
      tx.emailVerifications.find = async (id) => {
        const result = await find(id);
        if (!changed) { changed = true; await records().updateOne({ _id: new ObjectId(user.id) }, { $set: { tokenHash: verificationHash("b".repeat(64)) } }); }
        return result;
      };
      return operation(tx);
    }, options));
    expect((await request()).status).toBe(200); expect(state.fetch).toHaveBeenCalledTimes(1);
    expect((await saved())?.tokenHash).toBe(verificationHash(tokenFromMail()));
  });

  it("rejects expired proof without consuming it", async () => {
    await request(); const token = tokenFromMail();
    await records().updateOne({ _id: new ObjectId(user.id) }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    expect((await redeem(token)).status).toBe(400); expect(await saved()).not.toBeNull(); expect((await account())?.emailVerified).toBeNull();
  });

  it("returns the verified state without sending or storing another token", async () => {
    await connection.database.collection("User").updateOne({ _id: new ObjectId(user.id) }, { $set: { emailVerified: new Date() } });
    expect(await (await request()).json()).toEqual({ verified: true }); expect(await saved()).toBeNull(); expect(state.fetch).not.toHaveBeenCalled();
  });

  it("keeps bounded transaction failures retryable without sending an email", async () => {
    vi.spyOn(provider, "withNativeTransaction").mockRejectedValue(new TransactionRetryLimitError());
    expect((await request()).status).toBe(503); expect((await redeem("a".repeat(64))).status).toBe(503);
    expect(state.fetch).not.toHaveBeenCalled(); expect(await saved()).toBeNull();
  });
});
