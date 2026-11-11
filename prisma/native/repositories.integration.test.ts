import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import bcrypt from "bcrypt";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { checkNativeIndexes, ensureNativeIndexes } from "./indexes.mjs";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined }));
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local test database is not initialized");
  return state.connection;
} }));

import { contactRetryAfter } from "@/app/libs/contact-rate-limit";
import { assertOwnedAssets } from "@/app/libs/uploaded-assets";
import { requestPasswordReset, resetHash, resetPassword } from "@/app/libs/password-reset";

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("native repositories on a local MongoDB replica set", () => {
  let connection: DatabaseV8;
  let repositories: NativeRepositories;
  const userId = new ObjectId();
  const listingId = new ObjectId();

  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    // These tests delete documents and eventually drop this database. Never
    // accept DATABASE_URL, a remote cluster, or a non-test database name.
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) {
      throw new Error("Native integration tests require a loopback MongoDB URL and a bidlane_test_native_ database");
    }
    connection = createDatabaseV8(url!);
    state.connection = connection;
    await connection.mongoClient.connect();
    // The guarded local database is disposable, including stale indexes or
    // validators left by a previously interrupted integration run.
    await connection.database.dropDatabase();
    await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database);
  }, 30_000);
  beforeEach(async () => {
    for (const collection of await connection.database.listCollections().toArray()) {
      await connection.database.collection(collection.name).deleteMany({});
    }
    vi.stubEnv("NEXTAUTH_SECRET", "local-native-repository-test-secret");
    vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
    vi.stubEnv("RESEND_API_KEY", "local-test-no-email-sent");
    vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (connection) {
      await connection.database.dropDatabase();
      await connection.close();
      state.connection = undefined;
    }
  }, 30_000);

  async function seedReset(overrides: { sessionVersion?: string } = {}) {
    const now = new Date();
    await connection.database.collection("User").insertOne({
      _id: userId, email: "User@example.com", hashedPassword: "old-hash",
      sessionVersion: overrides.sessionVersion ?? "original", createdAt: now, updatedAt: now,
    });
    const token = "a".repeat(64);
    const record = {
      id: "email-hash:reset-key", email: "user@example.com", nonce: "generation-one", tokenHash: resetHash(token),
      requestedAt: now, expiresAt: new Date(now.getTime() + 1800000), userId: userId.toHexString(), sessionVersion: "original", usedAt: null,
    };
    await repositories.passwordResets.replace(record);
    return { record, token, now };
  }

  it("creates the legacy index definitions additively and idempotently", async () => {
    await ensureNativeIndexes(connection.database);
    expect(await checkNativeIndexes(connection.database)).toEqual([]);
    const indexes = await connection.database.collection("UploadedAsset").indexes();
    expect(indexes.find((index) => index.name === "UploadedAsset_url_key")?.unique).toBe(true);
    const quotaIndexes = await connection.database.collection("AbuseQuota").indexes();
    expect(quotaIndexes.every((index) => index.expireAfterSeconds === undefined)).toBe(true);
  });

  it.each(["contact", "upload", "abuse", "passwordReset"] as const)("increments concurrent %s buckets exactly once per request using BSON longs and string IDs", async (name) => {
    const expiresAt = new Date(Date.now() + 60000);
    const results = await Promise.all(Array.from({ length: 50 }, () => repositories.quotas[name].consume("global:123", expiresAt)));
    expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const collection = { contact: "ContactRateLimit", upload: "UploadQuota", abuse: "AbuseQuota", passwordReset: "PasswordResetQuota" }[name];
    const raw = await connection.database.collection<{ _id: string; count: Long }>(collection).findOne({ _id: "global:123" }, { promoteLongs: false });
    expect(raw?._id).toBe("global:123");
    expect(Long.isLong(raw?.count)).toBe(true);
    expect(raw?.count.toNumber()).toBe(50);
  });

  it("keeps the actual global contact admission cap under concurrent distinct senders", async () => {
    const now = Math.floor(Date.now() / 60000) * 60000 + 1000;
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => contactRetryAfter(`sender-${i}@example.com`, now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(30);
    const before = await connection.database.collection("ContactRateLimit").countDocuments();
    expect(await contactRetryAfter("later@example.com", now)).toBeGreaterThan(0);
    expect(await connection.database.collection("ContactRateLimit").countDocuments()).toBe(before);
  });

  it("removes expired buckets without deleting a current bucket", async () => {
    const now = new Date();
    await repositories.quotas.upload.consume("expired", now);
    await repositories.quotas.upload.consume("current", new Date(now.getTime() + 60000));
    await repositories.quotas.upload.deleteExpired(now);
    expect(await repositories.quotas.upload.read("expired")).toBeNull();
    expect(await repositories.quotas.upload.read("current")).toMatchObject({ count: 1 });
  });

  it("preserves asset string IDs, ObjectId ownership, byte counts, defaults, and unique URLs", async () => {
    const input = { id: "bidlane/seller/photo/public-id", userId: userId.toHexString(), kind: "PHOTO" as const, listingId: null, url: "https://res.cloudinary.com/demo/image/upload/v1/owned.jpg", bytes: 123, format: "jpg" };
    await repositories.assets.register(input);
    const raw = await connection.database.collection<{ _id: string; userId: ObjectId; bytes: Long; listingId: null; createdAt: Date }>("UploadedAsset").findOne({ _id: input.id }, { promoteLongs: false });
    expect(raw?.userId.equals(userId)).toBe(true);
    expect(raw?.bytes.toNumber()).toBe(123);
    expect(raw?.listingId).toBeNull();
    expect(raw?.createdAt).toBeInstanceOf(Date);
    await expect(repositories.assets.register({ ...input, id: "different-public-id" })).rejects.toMatchObject({ code: 11000 });
    await expect(assertOwnedAssets({ userId: userId.toHexString(), kind: "PHOTO", urls: [input.url] })).resolves.toBeUndefined();
  });

  it("rejects wrong owners, purposes, listing bindings, and missing binding fields", async () => {
    const base = { userId, kind: "PHOTO", listingId: null, bytes: Long.ONE, format: "jpg", createdAt: new Date() };
    const rows = [
      { ...base, _id: "valid", url: "https://res.cloudinary.com/demo/image/upload/valid.jpg" },
      { ...base, _id: "owner", url: "https://res.cloudinary.com/demo/image/upload/owner.jpg", userId: new ObjectId() },
      { ...base, _id: "purpose", url: "https://res.cloudinary.com/demo/image/upload/purpose.jpg", kind: "PROFILE" },
      { ...base, _id: "listing", url: "https://res.cloudinary.com/demo/image/upload/listing.jpg", listingId },
      { ...base, _id: "missing", url: "https://res.cloudinary.com/demo/image/upload/missing.jpg" },
    ];
    const collection = connection.database.collection<{ _id: string }>("UploadedAsset");
    await collection.insertMany(rows);
    await collection.updateOne({ _id: "missing" }, { $unset: { listingId: "" } });
    const input = { userId: userId.toHexString(), kind: "PHOTO" as const, urls: rows.map((row) => row.url) };
    expect((await repositories.assets.findOwned(input)).map((row) => row.url)).toEqual([rows[0].url]);
    expect((await repositories.assets.findOwned({ ...input, listingId: listingId.toHexString() })).map((row) => row.url).sort()).toEqual([rows[0].url, rows[3].url].sort());
    await expect(assertOwnedAssets(input)).rejects.toMatchObject({ status: 400 });
  });

  it("persists queue defaults, BSON longs and natural string keys", async () => {
    await requestPasswordReset("USER@example.com");
    const id = resetHash("user@example.com");
    const record = await repositories.passwordResets.find(id);
    const jobs = await repositories.recoveryEmails.candidates(new Date(), 20);
    expect(record).toMatchObject({ id, userId: null, sessionVersion: null, usedAt: null });
    expect(jobs).toHaveLength(1);
    const job = await repositories.recoveryEmails.find(jobs[0].id);
    expect(job).toMatchObject({ status: "PENDING", attempts: 0, lockedUntil: null, lockToken: null, resetId: id, nonce: record!.nonce });
    expect(job?.createdAt).toBeInstanceOf(Date);
    expect(await connection.database.collection<{ _id: string }>("PasswordReset").findOne({ _id: id }, { promoteLongs: false })).toMatchObject({ _id: id, tokenHash: record!.tokenHash, userId: null });
    expect(await connection.database.collection<{ _id: string }>("RecoveryEmail").findOne({ _id: jobs[0].id }, { promoteLongs: false })).toMatchObject({ _id: jobs[0].id, attempts: Long.ZERO, status: "PENDING" });
  });

  it("rolls back the token claim, password change, and session revocation if notice insertion fails", async () => {
    const { record, token, now } = await seedReset();
    await repositories.recoveryEmails.enqueue({ id: "collision", email: record.email, kind: "CHANGED", nextAttemptAt: now });
    const collection = connection.database.collection("RecoveryEmail");
    // Force the real service's final write to fail after it has claimed the
    // token and changed credentials. This index exists only in this local test.
    await collection.createIndex({ kind: 1 }, { unique: true, name: "test_queue_failure" });
    try {
      await expect(resetPassword(token, "a new long password")).rejects.toMatchObject({ code: 11000 });
    } finally {
      await collection.dropIndex("test_queue_failure");
    }
    expect(await repositories.passwordResets.find(record.id)).toMatchObject({ usedAt: null });
    expect(await repositories.recoveryUsers.find(record.userId)).toMatchObject({ hashedPassword: "old-hash", sessionVersion: "original" });
    expect(await connection.database.collection("RecoveryEmail").countDocuments()).toBe(1);
  });

  it("allows only one concurrent redemption and atomically queues one password-change notice", async () => {
    const { record, token } = await seedReset();
    const results = await Promise.allSettled([resetPassword(token, "a new long password"), resetPassword(token, "a new long password")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason.status).toBe(400);
    const user = await repositories.recoveryUsers.find(record.userId);
    expect(await bcrypt.compare("a new long password", user!.hashedPassword!)).toBe(true);
    expect(user?.sessionVersion).toMatch(/^[a-f0-9]{64}$/);
    expect((await repositories.passwordResets.find(record.id))?.usedAt).toBeInstanceOf(Date);
    expect(await connection.database.collection("RecoveryEmail").countDocuments({ kind: "CHANGED" })).toBe(1);
  });

  it("does not consume a reset bound to an obsolete session version", async () => {
    const { record, token } = await seedReset({ sessionVersion: "revoked" });
    await expect(resetPassword(token, "a new long password")).rejects.toMatchObject({ status: 400 });
    expect(await repositories.passwordResets.find(record.id)).toMatchObject({ usedAt: null });
    expect(await connection.database.collection("RecoveryEmail").countDocuments()).toBe(0);
  });

  it("binds idempotently but rejects replaced, used, or expired generations", async () => {
    const { record, now } = await seedReset();
    const user = { userId: record.userId, sessionVersion: record.sessionVersion };
    expect((await repositories.passwordResets.bind(record, now, user)).count).toBe(1);
    expect((await repositories.passwordResets.bind(record, now, user)).count).toBe(1);
    expect((await repositories.passwordResets.bind({ ...record, nonce: "old" }, now, user)).count).toBe(0);
    expect((await repositories.passwordResets.bind(record, record.expiresAt, user)).count).toBe(0);
    await repositories.passwordResets.claim(record, now);
    expect((await repositories.passwordResets.bind(record, now, user)).count).toBe(0);
  });

  it("arbitrates concurrent leases and fences out stale email workers after lease recovery", async () => {
    const now = new Date();
    await repositories.recoveryEmails.enqueue({ id: "mail-job", email: "user@example.com", kind: "RESET", resetId: "string-reset-id", nonce: "nonce", nextAttemptAt: now });
    const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => repositories.recoveryEmails.claim("mail-job", now, `worker-${i}`)));
    expect(claims.reduce((sum, result) => sum + result.count, 0)).toBe(1);
    const first = await repositories.recoveryEmails.find("mail-job");
    expect(first?.attempts).toBe(1);
    expect((await repositories.recoveryEmails.claim("mail-job", new Date(now.getTime() + 120001), "replacement-worker")).count).toBe(1);
    expect((await repositories.recoveryEmails.finish("mail-job", first!.lockToken!, { status: "SENT" })).count).toBe(0);
    expect((await repositories.recoveryEmails.finish("mail-job", "replacement-worker", { status: "SENT" })).count).toBe(1);
    expect(await repositories.recoveryEmails.find("mail-job")).toMatchObject({ status: "SENT", attempts: 2, lockedUntil: null, lockToken: null });
  });
});
