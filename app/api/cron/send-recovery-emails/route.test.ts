import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), config: vi.fn() }));
vi.mock("@/app/libs/recovery-email-delivery", () => ({ sendRecoveryEmails: mocks.send }));
vi.mock("@/app/libs/outbid-email", () => ({ getEmailConfiguration: mocks.config }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { GET } from "./route";
const request = (secret = "cron-test") => new Request("http://localhost/api/cron/send-recovery-emails", { headers: { authorization: `Bearer ${secret}` } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "cron-test"); vi.stubEnv("NEXTAUTH_SECRET", "auth-test"); mocks.config.mockReturnValue({}); mocks.send.mockResolvedValue({ checked: 1, sent: 1, failed: 0 }); });
afterEach(() => vi.unstubAllEnvs());
describe("recovery email cron", () => {
  it("rejects unauthorized schedulers", async () => { expect((await GET(request("bad"))).status).toBe(401); vi.stubEnv("CRON_SECRET", ""); expect((await GET(request())).status).toBe(401); expect(mocks.send).not.toHaveBeenCalled(); });
  it("requires mail configuration and the token derivation secret", async () => { mocks.config.mockReturnValueOnce(null); expect((await GET(request())).status).toBe(503); vi.stubEnv("NEXTAUTH_SECRET", ""); expect((await GET(request())).status).toBe(503); expect(mocks.send).not.toHaveBeenCalled(); });
  it("delivers an authorized batch", async () => { expect((await GET(request())).status).toBe(200); expect(mocks.send).toHaveBeenCalled(); });
  it("reports failures without leaking provider data", async () => { mocks.send.mockRejectedValueOnce(new Error("private token")); const response = await GET(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private token"); });
});
