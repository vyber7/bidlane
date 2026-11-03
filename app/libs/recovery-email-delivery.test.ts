import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ jobs: vi.fn(), job: vi.fn(), update: vi.fn(), cleanup: vi.fn(), reset: vi.fn(), bind: vi.fn(), users: vi.fn(), send: vi.fn() }));
vi.mock("./prismadb", () => ({ default: {
  recoveryEmail: { findMany: mocks.jobs, findUnique: mocks.job, updateMany: mocks.update, deleteMany: mocks.cleanup },
  passwordReset: { findUnique: mocks.reset, updateMany: mocks.bind, deleteMany: mocks.cleanup },
  user: { findMany: mocks.users },
} }));
vi.mock("./outbid-email", async (importOriginal) => { const actual = await importOriginal<typeof import("./outbid-email")>(); return { ...actual, sendEmail: mocks.send }; });
vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));
import { sendRecoveryEmails } from "./recovery-email-delivery";
import { resetHash, resetToken } from "./password-reset";
import { EmailProviderError } from "./outbid-email";
const now = new Date("2026-11-03T12:00:00Z");
let record: Record<string, unknown>;
let job: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net"); vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
  record = { id: "reset-id", email: "User@example.com", nonce: "nonce", tokenHash: resetHash(resetToken("reset-id", "nonce")), expiresAt: new Date(now.getTime() + 1800000), userId: null, sessionVersion: null, usedAt: null };
  job = { id: "job", email: "User@example.com", resetId: "reset-id", nonce: "nonce", kind: "RESET", attempts: 1, createdAt: now };
  mocks.jobs.mockResolvedValue([{ id: "job" }]); mocks.reset.mockImplementation(async () => record);
  mocks.update.mockImplementation(async ({ data }) => { if (data.lockToken) job.lockToken = data.lockToken; return { count: 1 }; });
  mocks.job.mockImplementation(async () => ({ ...job })); mocks.bind.mockResolvedValue({ count: 1 });
  mocks.users.mockResolvedValue([{ id: "user", email: "user@example.com", hashedPassword: "hash", sessionVersion: null }]);
  mocks.send.mockResolvedValue("mail-id"); mocks.cleanup.mockResolvedValue({ count: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("durable recovery email delivery", () => {
  it("binds the reset to an eligible account and sends a trusted-origin fragment link", async () => {
    expect(await sendRecoveryEmails()).toMatchObject({ sent: 1, failed: 0 });
    const [key, payload, idempotencyKey] = mocks.send.mock.calls[0];
    expect(key).toBe("test-key"); expect(payload.to).toEqual(["user@example.com"]);
    const url = new URL(payload.text.match(/https:\/\/\S+/)[0]);
    expect(url.origin).toBe("https://bidlane.net"); expect(url.pathname).toBe("/reset-password"); expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(resetToken("reset-id", "nonce"));
    expect(mocks.bind).toHaveBeenCalledWith({ where: { id: "reset-id", nonce: "nonce", usedAt: null, expiresAt: { gt: now } }, data: { userId: "user", sessionVersion: "" } });
    expect(idempotencyKey).toMatch(/^recovery\/job\/[a-f0-9]{64}$/);
    expect(mocks.update.mock.calls.at(-1)![0]).toMatchObject({ where: { status: "SENDING", lockToken: expect.any(String) }, data: { status: "SENT", lockToken: null } });
  });
  it.each([{ users: [] }, { users: [{ id: "user", email: "user@example.com", hashedPassword: null }] }, { users: [{ id: "one" }, { id: "two" }] }])("silently skips unknown, OAuth-only, or ambiguous accounts", async ({ users }) => {
    mocks.users.mockResolvedValue(users);
    expect(await sendRecoveryEmails()).toMatchObject({ skipped: 1 }); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled();
  });
  it.each([{ usedAt: now }, { expiresAt: now }, { nonce: "old-generation" }, { userId: "user", sessionVersion: "old-version" }])("skips used, expired, replaced, or revoked resets", async (change) => {
    Object.assign(record, change); expect(await sendRecoveryEmails()).toMatchObject({ skipped: 1 }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send if a resend or reset wins before binding", async () => {
    mocks.bind.mockResolvedValue({ count: 0 }); expect(await sendRecoveryEmails()).toMatchObject({ skipped: 1 }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("recovers an uncertain provider timeout with the same idempotency key", async () => {
    mocks.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    expect(await sendRecoveryEmails()).toMatchObject({ retried: 1 });
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ status: "PENDING", nextAttemptAt: new Date(now.getTime() + 30000) });
    expect(await sendRecoveryEmails()).toMatchObject({ sent: 1 });
    expect(mocks.send.mock.calls[0][2]).toBe(mocks.send.mock.calls[1][2]);
  });
  it("caps attempts and stops permanent provider failures", async () => {
    job.attempts = 6;
    expect(await sendRecoveryEmails()).toMatchObject({ failed: 1 }); expect(mocks.send).not.toHaveBeenCalled();
    job.attempts = 1; mocks.send.mockRejectedValueOnce(new EmailProviderError("invalid_email", false));
    expect(await sendRecoveryEmails()).toMatchObject({ failed: 1 });
  });
  it("sends a password-change notice without recovery secrets or the new password", async () => {
    job.kind = "CHANGED";
    expect(await sendRecoveryEmails()).toMatchObject({ sent: 1 });
    const payload = mocks.send.mock.calls[0][1];
    expect(payload.subject).toBe("Your BidLane password was changed"); expect(payload.text).not.toContain("token=");
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("does not send without an exclusive lease", async () => {
    mocks.update.mockResolvedValue({ count: 0 }); expect(await sendRecoveryEmails()).toMatchObject({ checked: 0 }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("leaves queued emails untouched without configuration", async () => {
    vi.stubEnv("RESEND_API_KEY", ""); await expect(sendRecoveryEmails()).rejects.toThrow(); expect(mocks.jobs).not.toHaveBeenCalled();
  });
});
