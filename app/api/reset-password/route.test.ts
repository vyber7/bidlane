import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn() }));
vi.mock("@/app/libs/password-reset", () => ({ requestPasswordReset: mocks.request, resetPassword: mocks.reset, RESET_REQUEST_MESSAGE: "If an eligible account exists, a reset link will be emailed." }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { POST as requestReset } from "../forgot-password/route";
import { POST as reset } from "./route";
import { ApiRequestError } from "@/app/libs/api-request";
const input = { token: "a".repeat(64), password: "a long password", confirmPassword: "a long password" };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.request.mockResolvedValue(undefined); mocks.reset.mockResolvedValue(undefined); });
describe("password recovery API", () => {
  it("returns the same response for any syntactically valid address, including throttled requests", async () => {
    const known = await requestReset(request({ email: " user@example.com " }));
    const unknown = await requestReset(request({ email: "unknown@example.com" }));
    expect(known.status).toBe(200); expect(unknown.status).toBe(200); expect(await known.json()).toEqual(await unknown.json());
    expect(mocks.request).toHaveBeenCalledWith("user@example.com");
  });
  it.each([null, [], { email: "bad" }, { email: "a".repeat(255) }])("rejects invalid request payloads", async (body) => {
    expect((await requestReset(request(body))).status).toBe(400); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("consumes the exact validated token and password without requiring a session", async () => {
    const response = await reset(request(input)); expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith(input.token, input.password);
  });
  it.each(["a".repeat(12), "a".repeat(72), "é".repeat(36), "😀".repeat(18)])("accepts exact password policy boundaries: %s", async (password) => {
    const response = await reset(request({ ...input, password, confirmPassword: password }));
    expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith(input.token, password);
  });
  it.each([{ token: "short" }, { password: "short", confirmPassword: "short" }, { confirmPassword: "not the same" }, { password: "x".repeat(73), confirmPassword: "x".repeat(73) }, { password: "é".repeat(37), confirmPassword: "é".repeat(37) }])("rejects invalid reset fields", async (change) => {
    expect((await reset(request({ ...input, ...change }))).status).toBe(400); expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON for both endpoints", async () => {
    for (const handler of [requestReset, reset]) expect((await handler(new Request("http://localhost/api", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("reports expired/replayed links without a server error", async () => {
    mocks.reset.mockRejectedValueOnce(new ApiRequestError(400, "This reset link is invalid, expired, or already used."));
    expect((await reset(request(input))).status).toBe(400);
  });
  it("never exposes internal errors containing recovery data", async () => {
    mocks.request.mockRejectedValueOnce(new Error("private@example.com"));
    const response = await requestReset(request({ email: "user@example.com" }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private@example.com");
  });
});
