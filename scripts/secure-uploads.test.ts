import { beforeEach, describe, expect, it, vi } from "vitest";
import { secureUploads } from "./secure-uploads.mjs";
const api = { upload_preset: vi.fn(), update_upload_preset: vi.fn() };
const fetchDeployment = vi.fn();
beforeEach(() => { vi.clearAllMocks(); api.upload_preset.mockResolvedValue({ unsigned: false }); api.update_upload_preset.mockResolvedValue({}); fetchDeployment.mockResolvedValueOnce(Response.json({ policy: "authenticated-4mb-v1", maxBytes: 4_000_000 })).mockResolvedValueOnce(new Response(null, { status: 401 })); });
describe("coordinated upload cutover", () => {
  it("checks production readiness and authorization before disabling unsigned uploads", async () => {
    expect(await secureUploads(["apply", "--deployment-url", "https://production.test"], api, fetchDeployment)).toContain("Cutover complete");
    expect(api.update_upload_preset).toHaveBeenCalledWith("auctions", { unsigned: false, timeout: 10000 });
    expect(fetchDeployment.mock.invocationCallOrder[1]).toBeLessThan(api.update_upload_preset.mock.invocationCallOrder[0]);
    expect(api.upload_preset.mock.invocationCallOrder[0]).toBeGreaterThan(api.update_upload_preset.mock.invocationCallOrder[0]);
  });
  it("reports current state without changing the provider", async () => {
    api.upload_preset.mockResolvedValue({ unsigned: true });
    expect(await secureUploads(["check"], api, fetchDeployment)).toContain("still permits unsigned");
    expect(fetchDeployment).not.toHaveBeenCalled(); expect(api.update_upload_preset).not.toHaveBeenCalled();
  });
  it("refuses an old deployment", async () => {
    fetchDeployment.mockReset().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(secureUploads(["apply", "--deployment-url", "https://production.test"], api, fetchDeployment)).rejects.toThrow("not serving");
    expect(api.update_upload_preset).not.toHaveBeenCalled();
  });
  it("refuses a deployment that accepts anonymous uploads", async () => {
    fetchDeployment.mockReset().mockResolvedValueOnce(Response.json({ policy: "authenticated-4mb-v1", maxBytes: 4_000_000 })).mockResolvedValueOnce(new Response(null, { status: 201 }));
    await expect(secureUploads(["apply", "--deployment-url", "https://production.test"], api, fetchDeployment)).rejects.toThrow("unauthenticated");
    expect(api.update_upload_preset).not.toHaveBeenCalled();
  });
  it("fails if the provider readback remains unsigned", async () => {
    api.upload_preset.mockResolvedValue({ unsigned: true });
    await expect(secureUploads(["apply", "--deployment-url", "https://production.test"], api, fetchDeployment)).rejects.toThrow("Could not verify");
    expect(api.update_upload_preset).toHaveBeenCalledTimes(1);
  });
  it.each([[], ["apply"], ["apply", "--deployment-url", "http://production.test"], ["apply", "--deployment-url", "https://user:pass@production.test"]].map((args) => ({ args })))("never mutates for invalid arguments %j", async ({ args }) => {
    await expect(secureUploads(args, api, fetchDeployment)).rejects.toThrow(); expect(api.update_upload_preset).not.toHaveBeenCalled();
  });
});
