import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ quota: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/libs/contact-rate-limit", () => ({ contactRetryAfter: mocks.quota }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { POST } from "./route";

const input = {
  name: " Alex Morgan ", email: " alex@example.com ", topic: "Buying or bidding",
  message: " Can I inspect the car? ", website: "", submissionId: "a9c84f25-58ef-42eb-8f52-237dca9872aa",
};
const request = (body: unknown = input) => new Request("http://localhost/api/contact", {
  method: "POST", body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.quota.mockResolvedValue(0);
  mocks.fetch.mockResolvedValue(Response.json({ id: "email-id" }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("contact endpoint", () => {
  it("sends only to support using the verified sender and visitor reply address", async () => {
    expect((await POST(request())).status).toBe(200);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(options.body)).toEqual({
      from: "BidLane <alerts@bidlane.net>", to: ["support@bidlane.net"],
      reply_to: "alex@example.com", subject: "[BidLane support] Buying or bidding — Alex Morgan",
      text: "Name: Alex Morgan\nEmail: alex@example.com\nTopic: Buying or bidding\n\nCan I inspect the car?",
    });
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(mocks.quota).toHaveBeenCalledWith("alex@example.com");
  });
  it("keeps retry keys stable but changes them when the message changes", async () => {
    await POST(request()); await POST(request());
    await POST(request({ ...input, message: "Another question" }));
    const keys = mocks.fetch.mock.calls.map((call) => call[1].headers["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[0]);
  });
  it.each([null, [], { ...input, email: "bad" }, { ...input, name: "x\nBcc: bad" },
    { ...input, message: " " }, { ...input, message: "x".repeat(5001) },
    { ...input, topic: "Unknown" }, { ...input, submissionId: "bad" },
  ])("rejects invalid input without sending: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    expect((await POST(new Request("http://localhost/api/contact", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("silently drops spam-trap submissions", async () => {
    expect((await POST(request({ ...input, website: "https://spam.example" }))).status).toBe(200);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("returns a retry interval when rate limited", async () => {
    mocks.quota.mockResolvedValue(120);
    const response = await POST(request());
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed if the quota database is unavailable", async () => {
    mocks.quota.mockRejectedValue(new Error("Database unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["RESEND_API_KEY", "EMAIL_FROM"])("handles missing %s", async (key) => {
    vi.stubEnv(key, "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not expose provider errors or report success on rejection", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ message: "private provider details" }, { status: 422 }));
    const response = await POST(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("private provider details");
  });
  it("handles a timeout and a malformed success response", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("timeout"));
    expect((await POST(request())).status).toBe(503);
    mocks.fetch.mockResolvedValueOnce(Response.json({}));
    expect((await POST(request())).status).toBe(502);
  });
});
