import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ queue: vi.fn() }));
vi.mock("@/app/libs/ending-soon-reminders", () => ({ queueEndingSoonReminders: mocks.queue }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { GET } from "./route";
const request = (secret = "cron-test") => new Request("http://localhost/api/cron/ending-soon-reminders", { headers: { authorization: `Bearer ${secret}` } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "cron-test");
  mocks.queue.mockResolvedValue({ checked: 1, queued: 1, skipped: 0, failed: 0, hasMore: false });
});
afterEach(() => vi.unstubAllEnvs());
describe("reminder cron", () => {
  it("fails closed for missing or incorrect credentials", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("returns the authorized batch summary", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ queued: 1 });
  });
  it("reports partial and unexpected failures without exposing details", async () => {
    mocks.queue.mockResolvedValueOnce({ failed: 1 });
    expect((await GET(request())).status).toBe(500);
    mocks.queue.mockRejectedValueOnce(new Error("private database details"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to queue auction reminders" });
  });
});
