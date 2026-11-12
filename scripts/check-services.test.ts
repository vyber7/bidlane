import { describe, expect, it, vi } from "vitest";
import { checkCronConfiguration, checkServices, cronPaths } from "./check-services.mjs";

const env = Object.fromEntries([
  "NEXTAUTH_SECRET", "CRON_SECRET", "GITHUB_ID", "GITHUB_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "PUSHER_APP_ID", "NEXT_PUBLIC_PUSHER_APP_KEY", "PUSHER_SECRET", "RESEND_API_KEY", "EMAIL_FROM",
].map((key) => [key, "private-fixture-value"]));
env.NEXTAUTH_URL = "http://localhost:3000";
const config = { crons: cronPaths.map((path) => ({ path, schedule: "* * * * *" })) };
function clients(response = Response.json({ data: [] })) {
  return {
    cloudinary: { config: vi.fn(), api: { ping: vi.fn().mockResolvedValue({ status: "ok" }) } },
    createPusher: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(Response.json({ channels: {} })) }),
    fetch: vi.fn().mockResolvedValue(response),
  };
}

describe("read-only service preflight", () => {
  it("authenticates with metadata requests without returning provider data or credentials", async () => {
    const api = clients();
    const report = await checkServices(env, config, api);
    expect(report.checksPassed).toBe(true);
    expect(report.readOnly).toBe(true);
    expect(report.remaining).toHaveLength(5);
    expect(api.cloudinary.api.ping).toHaveBeenCalledWith({ timeout: 10_000 });
    expect(api.createPusher.mock.results[0].value.get).toHaveBeenCalledWith({ path: "/channels" });
    expect(api.fetch).toHaveBeenCalledWith("https://api.resend.com/domains", expect.objectContaining({ method: "GET" }));
    expect(JSON.stringify(report)).not.toContain("private-fixture-value");
  });
  it.each([401, 403])("recognizes Resend's sending-only restriction at HTTP %s", async (status) => {
    const report = await checkServices(env, config, clients(Response.json({ name: "restricted_api_key" }, { status })));
    expect(report.checksPassed).toBe(true);
    expect(report.checks.find((check) => check.check === "resend.credentials")?.detail).toContain("Sending-only key");
  });
  it.each([
    [401, { name: "invalid_api_key" }], [500, { name: "restricted_api_key" }], [200, { unexpected: true }],
  ])("does not accept an invalid key or provider response (%s)", async (status, body) => {
    const report = await checkServices(env, config, clients(Response.json(body, { status })));
    expect(report.checksPassed).toBe(false);
    expect(report.checks.find((check) => check.check === "resend.credentials")?.status).toBe("failed");
  });
  it("reports missing configuration without calling a provider", async () => {
    const api = clients();
    const report = await checkServices({}, config, api);
    expect(report.checksPassed).toBe(false);
    expect(api.cloudinary.api.ping).not.toHaveBeenCalled();
    expect(api.createPusher).not.toHaveBeenCalled();
    expect(api.fetch).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures while completing the independent checks", async () => {
    const api = clients();
    api.cloudinary.api.ping.mockRejectedValue(new Error("private-fixture-value"));
    api.fetch.mockRejectedValue(new Error("private-fixture-value"));
    const report = await checkServices(env, config, api);
    expect(report.checksPassed).toBe(false);
    expect(report.checks.find((check) => check.check === "pusher.credentials")?.status).toBe("passed");
    expect(JSON.stringify(report)).not.toContain("private-fixture-value");
  });
  it.each(["http://remote.test", "https://user:password@example.test", "not-a-url"])("rejects an unusable authentication origin (%s)", async (origin) => {
    const report = await checkServices({ ...env, NEXTAUTH_URL: origin }, config, clients());
    expect(report.checks.find((check) => check.check === "auth.configuration")?.status).toBe("failed");
  });
  it("rejects an unsuccessful Cloudinary ping", async () => {
    const api = clients();
    api.cloudinary.api.ping.mockResolvedValue({ status: "unexpected" });
    const report = await checkServices(env, config, api);
    expect(report.checks.find((check) => check.check === "cloudinary.credentials")?.status).toBe("failed");
  });
});

describe("cron deployment inventory", () => {
  it("accepts the complete four-worker minute schedule", () => {
    expect(checkCronConfiguration(config).status).toBe("passed");
  });
  it.each([
    {}, { crons: config.crons.slice(1) },
    { crons: [config.crons[0], ...config.crons.slice(0, 3)] },
    { crons: config.crons.map((job) => ({ ...job, schedule: "0 0 * * *" })) },
  ])("rejects missing, duplicated, or slowed worker schedules (%j)", (inventory) => {
    expect(checkCronConfiguration(inventory).status).toBe("failed");
  });
});
