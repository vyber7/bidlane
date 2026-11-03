import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), fetch: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ emailVerification: mocks, user: mocks }) } }));
import { requestEmailVerification, confirmEmailVerification, verificationHash } from "./email-verification";
const user = { id: "seller", email: "seller@example.com", emailVerified: null };
const now = new Date("2026-11-03T12:00:00Z");
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>"); vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.findUnique.mockResolvedValue(null); mocks.upsert.mockResolvedValue({});
  mocks.deleteMany.mockResolvedValue({ count: 1 }); mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.fetch.mockImplementation(async () => Response.json({ id: "mail" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function record() { return { id: user.id, email: user.email, tokenHash: verificationHash("a".repeat(64)), requestedAt: now, expiresAt: new Date(now.getTime() + 1800000) }; }

describe("email verification", () => {
  it("emails only the signed-in address and stores only an expiring token hash", async () => {
    await expect(requestEmailVerification(user)).resolves.toEqual({ sent: true });
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(payload.to).toEqual([user.email]);
    const link = new URL(payload.text.match(/https:\/\/\S+/)[0]);
    expect(link.origin).toBe("https://bidlane.net"); expect(link.pathname).toBe("/verify-email"); expect(link.search).toBe("");
    const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const stored = mocks.upsert.mock.calls[0][0].create;
    expect(stored.tokenHash).toBe(verificationHash(token)); expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.expiresAt).toEqual(new Date(now.getTime() + 1800000));
  });
  it("rotates old links on a resend", async () => {
    mocks.findUnique.mockResolvedValue({ ...record(), requestedAt: new Date(now.getTime() - 60001) });
    await requestEmailVerification(user); await requestEmailVerification(user);
    expect(mocks.upsert.mock.calls[0][0].update.tokenHash).not.toBe(mocks.upsert.mock.calls[1][0].update.tokenHash);
  });
  it("throttles resends before contacting the mail provider", async () => {
    mocks.findUnique.mockResolvedValue(record());
    await expect(requestEmailVerification(user)).rejects.toMatchObject({ status: 429 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not send for an already verified account", async () => {
    expect(await requestEmailVerification({ ...user, emailVerified: now })).toEqual({ verified: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails when mail configuration is unavailable", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(requestEmailVerification(user)).rejects.toMatchObject({ status: 503 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("reports a provider rejection without exposing its body", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ message: "private details" }, { status: 403 }));
    await expect(requestEmailVerification(user)).rejects.toMatchObject({ status: 502 });
  });
  it("claims the exact nonexpired token before verifying the matching user and email", async () => {
    const saved = record(); mocks.findUnique.mockResolvedValue(saved);
    await confirmEmailVerification("a".repeat(64));
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: user.id, tokenHash: saved.tokenHash, expiresAt: { gt: now } } });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: user.id, email: user.email }, data: { emailVerified: now } });
  });
  it.each([null, { ...record(), expiresAt: now }])("rejects missing or expired tokens", async (saved) => {
    mocks.findUnique.mockResolvedValue(saved);
    await expect(confirmEmailVerification("a".repeat(64))).rejects.toMatchObject({ status: 400 });
    expect(mocks.updateMany).not.toHaveBeenCalled(); expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it("does not verify on a concurrent token claim or replay", async () => {
    mocks.findUnique.mockResolvedValue(record()); mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(confirmEmailVerification("a".repeat(64))).rejects.toMatchObject({ status: 400 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a changed or deleted account", async () => {
    mocks.findUnique.mockResolvedValue(record()); mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(confirmEmailVerification("a".repeat(64))).rejects.toMatchObject({ status: 400 });
  });
});
