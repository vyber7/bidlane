import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ quota: vi.fn(), quotaUpdate: vi.fn(), cleanup: vi.fn(), upsert: vi.fn(), create: vi.fn(), findReset: vi.fn(), claim: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), hash: vi.fn(), transaction: vi.fn() }));
vi.mock("./prismadb", () => ({ default: {
  passwordResetQuota: { upsert: mocks.quota, update: mocks.quotaUpdate, deleteMany: mocks.cleanup },
  passwordReset: { findUnique: mocks.findReset },
  $transaction: mocks.transaction,
} }));
vi.mock("bcrypt", () => ({ default: { hash: mocks.hash } }));
import { requestPasswordReset, resetPassword, resetHash, resetToken } from "./password-reset";
const now = new Date("2026-11-03T12:00:00Z");
const token = "a".repeat(64);
const record = { id: "reset-id", email: "User@example.com", userId: "user", nonce: "nonce", tokenHash: resetHash(token), usedAt: null, expiresAt: new Date(now.getTime() + 1800000), sessionVersion: "" };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net"); vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
  mocks.quota.mockResolvedValue({ count: 1 }); mocks.cleanup.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (fn) => fn({ passwordReset: { upsert: mocks.upsert, updateMany: mocks.claim }, recoveryEmail: { create: mocks.create }, user: { findUnique: mocks.findUser, updateMany: mocks.updateUser } }));
  mocks.findReset.mockResolvedValue(record); mocks.claim.mockResolvedValue({ count: 1 });
  mocks.findUser.mockResolvedValue({ id: "user", email: "user@example.com", hashedPassword: "old-hash", sessionVersion: null });
  mocks.updateUser.mockResolvedValue({ count: 1 }); mocks.hash.mockResolvedValue("new-hash");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("request password reset", () => {
  it.each(["User@example.com", "unknown@example.com"])("queues identical work for %s without looking up accounts or sending mail", async (email) => {
    await requestPasswordReset(email);
    expect(mocks.findUser).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
    const saved = mocks.upsert.mock.calls[0][0].create;
    expect(saved.id).toBe(resetHash(email.toLowerCase())); expect(saved.expiresAt).toEqual(new Date(now.getTime() + 1800000));
    const derived = resetToken(saved.id, saved.nonce);
    expect(saved.tokenHash).toBe(resetHash(derived)); expect(JSON.stringify(saved)).not.toContain(derived);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email, resetId: saved.id, nonce: saved.nonce, kind: "RESET" }) });
    expect(saved.userId).toBeNull(); expect(saved.usedAt).toBeNull();
  });
  it("rotates the token and queues a new generation on resend", async () => {
    await requestPasswordReset("user@example.com"); await requestPasswordReset("USER@example.com");
    const first = mocks.upsert.mock.calls[0][0], second = mocks.upsert.mock.calls[1][0];
    expect(first.where).toEqual(second.where); expect(first.update.tokenHash).not.toBe(second.update.tokenHash);
  });
  it.each(["global", "email"])("silently throttles the %s quota without account-dependent output", async (kind) => {
    mocks.quota.mockImplementation(async ({ create }) => ({ count: create.id.startsWith(kind + ":") ? 31 : 1 }));
    await expect(requestPasswordReset("user@example.com")).resolves.toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("recovers a quota creation race", async () => {
    mocks.quota.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    mocks.quotaUpdate.mockResolvedValue({ count: 2 });
    await requestPasswordReset("user@example.com"); expect(mocks.quotaUpdate).toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalled();
  });
  it("fails consistently without mail configuration", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(requestPasswordReset("user@example.com")).rejects.toMatchObject({ status: 503 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
describe("consume a reset link", () => {
  it("claims an unused nonexpired token, changes only the bound credentials, revokes sessions, and queues a notice atomically", async () => {
    await resetPassword(token, "a long password");
    expect(mocks.hash).toHaveBeenCalledWith("a long password", 12);
    expect(mocks.claim).toHaveBeenCalledWith({ where: { id: record.id, tokenHash: record.tokenHash, nonce: record.nonce, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "user", email: "user@example.com", hashedPassword: "old-hash" }, data: { hashedPassword: "new-hash", sessionVersion: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "user@example.com", kind: "CHANGED" }) });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...record, usedAt: now }, { ...record, expiresAt: now }, { ...record, userId: null }])("rejects unusable links before hashing", async (value) => {
    mocks.findReset.mockResolvedValue(value);
    await expect(resetPassword(token, "a long password")).rejects.toMatchObject({ status: 400 });
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("rejects replay or a replaced token at the atomic claim", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    await expect(resetPassword(token, "a long password")).rejects.toMatchObject({ status: 400 });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it.each([null, { id: "user", email: "other@example.com", hashedPassword: "old-hash" }, { id: "user", email: "user@example.com", hashedPassword: null }, { id: "user", email: "user@example.com", hashedPassword: "old-hash", sessionVersion: "changed" }])("rejects changed, deleted, or connected-only accounts", async (user) => {
    mocks.findUser.mockResolvedValue(user);
    await expect(resetPassword(token, "a long password")).rejects.toMatchObject({ status: 400 });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("guards against a concurrent password change and never queues a false notice", async () => {
    mocks.updateUser.mockResolvedValue({ count: 0 });
    await expect(resetPassword(token, "a long password")).rejects.toMatchObject({ status: 400 }); expect(mocks.create).not.toHaveBeenCalled();
  });
});
