import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ quotaRead: vi.fn(), quota: vi.fn(), cleanup: vi.fn(), replace: vi.fn(), enqueue: vi.fn(), findReset: vi.fn(), claim: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), hash: vi.fn(), transaction: vi.fn() }));
vi.mock("./native-repositories", () => ({
  getNativeRepositories: () => ({ quotas: { passwordReset: { read: mocks.quotaRead, consume: mocks.quota, deleteExpired: mocks.cleanup } }, passwordResets: { findByTokenHash: mocks.findReset } }),
  withNativeTransaction: mocks.transaction,
}));
vi.mock("bcrypt", () => ({ default: { hash: mocks.hash } }));
import { requestPasswordReset, resetPassword, resetHash, resetToken } from "./password-reset";
const now = new Date("2026-11-03T12:00:00Z");
const token = "a".repeat(64);
const record = { id: "reset-id", email: "User@example.com", userId: "user", nonce: "nonce", tokenHash: resetHash(token), usedAt: null, expiresAt: new Date(now.getTime() + 1800000), sessionVersion: "" };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net"); vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
  mocks.quotaRead.mockResolvedValue(null); mocks.quota.mockResolvedValue({ count: 1 }); mocks.cleanup.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (fn) => fn({ passwordResets: { replace: mocks.replace, claim: mocks.claim }, recoveryEmails: { enqueue: mocks.enqueue }, recoveryUsers: { find: mocks.findUser, updatePassword: mocks.updateUser } }));
  mocks.findReset.mockResolvedValue(record); mocks.claim.mockResolvedValue({ count: 1 });
  mocks.findUser.mockResolvedValue({ id: "user", email: "user@example.com", hashedPassword: "old-hash", sessionVersion: null });
  mocks.updateUser.mockResolvedValue({ count: 1 }); mocks.hash.mockResolvedValue("new-hash");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("request password reset", () => {
  it("keeps the global queue cap atomic when concurrent prechecks all pass", async () => {
    const counts = new Map<string, number>();
    mocks.quota.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => requestPasswordReset(`user-${index}@example.com`)));
    expect(results.every((result) => result === undefined)).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledTimes(30);
  });
  it("silently rejects known global exhaustion without allocating an email bucket", async () => {
    mocks.quotaRead.mockResolvedValue({ count: 30 });
    await expect(requestPasswordReset("fresh@example.com")).resolves.toBeUndefined();
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.quotaRead.mockRejectedValueOnce(new Error("down"));
    await expect(requestPasswordReset("user@example.com")).rejects.toThrow("down");
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("keeps blocked address variants from suppressing other accounts' recovery emails", async () => {
    const counts = new Map<string, number>();
    mocks.quota.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    await Promise.all(Array.from({ length: 40 }, (_, index) => requestPasswordReset(index % 2 ? " User@EXAMPLE.com " : "user@example.com")));
    expect(mocks.enqueue).toHaveBeenCalledTimes(3);
    expect(counts.get(`global:${Math.floor(now.getTime() / 60_000)}`)).toBe(3);
    await expect(requestPasswordReset("another@example.com")).resolves.toBeUndefined();
    expect(mocks.enqueue).toHaveBeenCalledTimes(4);
  });
  it.each(["User@example.com", "unknown@example.com"])("queues identical work for %s without looking up accounts or sending mail", async (email) => {
    await requestPasswordReset(email);
    expect(mocks.findUser).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
    const saved = mocks.replace.mock.calls[0][0];
    expect(saved.id).toBe(resetHash(email.toLowerCase())); expect(saved.expiresAt).toEqual(new Date(now.getTime() + 1800000));
    const derived = resetToken(saved.id, saved.nonce);
    expect(saved.tokenHash).toBe(resetHash(derived)); expect(JSON.stringify(saved)).not.toContain(derived);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ email: email.toLowerCase(), resetId: saved.id, nonce: saved.nonce, kind: "RESET" }));
    expect(saved.userId).toBeNull(); expect(saved.usedAt).toBeNull();
  });
  it("rotates the token and queues a new generation on resend", async () => {
    await requestPasswordReset("user@example.com"); await requestPasswordReset("USER@example.com");
    const first = mocks.replace.mock.calls[0][0], second = mocks.replace.mock.calls[1][0];
    expect(first.id).toEqual(second.id); expect(first.tokenHash).not.toBe(second.tokenHash);
  });
  it.each(["global", "email"])("silently throttles the %s quota without account-dependent output", async (kind) => {
    mocks.quota.mockImplementation(async (id: string) => ({ count: id.startsWith(kind + ":") ? 31 : 1 }));
    await expect(requestPasswordReset("user@example.com")).resolves.toBeUndefined();
    expect(mocks.replace).not.toHaveBeenCalled();
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
    expect(mocks.claim).toHaveBeenCalledWith({ id: record.id, tokenHash: record.tokenHash, nonce: record.nonce }, now);
    expect(mocks.updateUser).toHaveBeenCalledWith({ id: "user", email: "user@example.com", hashedPassword: "old-hash" }, { hashedPassword: "new-hash", sessionVersion: expect.stringMatching(/^[a-f0-9]{64}$/) }, now);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ email: "user@example.com", kind: "CHANGED" }));
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
    await expect(resetPassword(token, "a long password")).rejects.toMatchObject({ status: 400 }); expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
