import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), config: vi.fn() }));
vi.mock("@/app/libs/notification-email-delivery", () => ({ sendNotificationEmails: mocks.send }));
vi.mock("@/app/libs/outbid-email", () => ({ getEmailConfiguration: mocks.config }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { GET } from "./route";
const request = (secret = "cron-test") => new Request("http://localhost/api/cron/send-notification-emails", { headers: { authorization: `Bearer ${secret}` } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "cron-test"); mocks.config.mockReturnValue({}); mocks.send.mockResolvedValue({ checked: 1, sent: 1, skipped: 0, retried: 0, failed: 0, hasMore: false }); });
afterEach(() => vi.unstubAllEnvs());
describe("email cron", () => {
  it("rejects missing or incorrect scheduler credentials before processing", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("returns 503 and leaves jobs untouched when email is not configured", async () => {
    mocks.config.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("processes an authorized batch and reports its counts", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ checked: 1, sent: 1, failed: 0 });
  });
  it("reports partial and unexpected failures without exposing provider details", async () => {
    mocks.send.mockResolvedValueOnce({ checked: 1, sent: 0, skipped: 0, retried: 0, failed: 1, hasMore: false });
    expect((await GET(request())).status).toBe(500);
    mocks.send.mockRejectedValueOnce(new Error("secret buyer@example.com"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("buyer@example.com");
  });
});
