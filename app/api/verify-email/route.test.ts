import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), request: vi.fn(), confirm: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/email-verification", () => ({ requestEmailVerification: mocks.request, confirmEmailVerification: mocks.confirm }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { POST as requestVerification } from "../account/verify-email/route";
import { POST as confirm } from "./route";
import { ApiRequestError } from "@/app/libs/api-request";
beforeEach(() => { vi.clearAllMocks(); mocks.request.mockResolvedValue({ sent: true }); mocks.confirm.mockResolvedValue(undefined); });
describe("verification routes", () => {
  it("requires a session before sending", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await requestVerification()).status).toBe(401); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("sends to the authenticated user, never a supplied recipient", async () => {
    const user = { id: "user", email: "a@example.com" }; mocks.user.mockResolvedValue(user);
    expect((await requestVerification()).status).toBe(200); expect(mocks.request).toHaveBeenCalledWith(user);
  });
  it("preserves cooldown errors", async () => {
    mocks.user.mockResolvedValue({ id: "user" }); mocks.request.mockRejectedValueOnce(new ApiRequestError(429, "Wait a minute"));
    expect((await requestVerification()).status).toBe(429);
  });
  it.each(["{", "null", JSON.stringify({ token: "short" })])("rejects invalid tokens: %s", async (body) => {
    expect((await confirm(new Request("http://localhost/api/verify-email", { method: "POST", body }))).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("accepts possession of a valid token without requiring a logged-in session", async () => {
    expect((await confirm(new Request("http://localhost/api/verify-email", { method: "POST", body: JSON.stringify({ token: "a".repeat(64) }) }))).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith("a".repeat(64));
  });
  it("does not expose database or provider details", async () => {
    mocks.confirm.mockRejectedValueOnce(new Error("secret database value"));
    const response = await confirm(new Request("http://localhost/api/verify-email", { method: "POST", body: JSON.stringify({ token: "a".repeat(64) }) }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret database");
  });
});
