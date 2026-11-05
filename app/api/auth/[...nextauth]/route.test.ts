import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiRequestError } from "@/app/libs/api-request";
const mocks = vi.hoisted(() => ({ user: vi.fn(), compare: vi.fn(), limit: vi.fn(), headers: new Headers(), cookies: [] as Array<{ name: string; value: string }> }));
// NextAuth v4 loads next/headers with CommonJS require, which bypasses
// Vitest ESM module mocks. Spy on that exact export for request-local state.
const nextHeaders = createRequire(import.meta.url)("next/headers") as { headers: () => unknown; cookies: () => unknown };
vi.mock("@/app/libs/prismadb", () => ({ default: { user: { findUnique: mocks.user } } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
import { GET, POST } from "./route";
const origin = "http://localhost:3000";
const context = (segments = ["callback", "credentials"]) => ({ params: Promise.resolve({ nextauth: segments }) });
function request(body: string, contentType = "application/x-www-form-urlencoded") {
  mocks.headers = new Headers({ "content-type": contentType });
  return new NextRequest(`${origin}/api/auth/callback/credentials`, { method: "POST", headers: mocks.headers, body });
}
function credentials(email = "driver@example.com") { return new URLSearchParams({ email, password: "password", csrfToken: "test-csrf", callbackUrl: origin, json: "true" }).toString(); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(nextHeaders, "headers").mockImplementation(async () => mocks.headers);
  vi.spyOn(nextHeaders, "cookies").mockImplementation(async () => ({ getAll: () => mocks.cookies }));
  vi.stubEnv("NEXTAUTH_URL", origin); vi.stubEnv("NEXTAUTH_SECRET", "auth-test-secret");
  const hash = createHash("sha256").update("test-csrf" + "auth-test-secret").digest("hex");
  mocks.cookies = [{ name: "next-auth.csrf-token", value: `test-csrf|${hash}` }];
  mocks.limit.mockResolvedValue(undefined); mocks.compare.mockResolvedValue(true);
  mocks.user.mockResolvedValue({ id: "user", email: "driver@example.com", name: "Driver", hashedPassword: "hash", sessionVersion: "v1" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("bounded NextAuth credentials protocol", () => {
  it.each(["AuthUnavailable", "RateLimited:60"])("keeps a successful session when callbackUrl contains error=%s", async (error) => {
    const callback = new URL("/signin", origin); callback.searchParams.set("error", error);
    const body = new URLSearchParams(credentials()); body.set("callbackUrl", callback.href);
    const response = await POST(request(body.toString()), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session-token");
    expect((await response.json()).url).toBe(callback.href);
  });
  it("preserves successful ordinary form redirects even to an error-looking callback URL", async () => {
    const callback = `${origin}/signin?error=AuthUnavailable`;
    const body = new URLSearchParams(credentials()); body.delete("json"); body.set("callbackUrl", callback);
    const response = await POST(request(body.toString()), context());
    expect(response.status).toBe(302); expect(response.headers.get("location")).toBe(callback);
    expect(response.headers.get("set-cookie")).toContain("session-token");
  });
  it.each(["application/x-www-form-urlencoded", "application/json"])("preserves a real successful NextAuth login for %s", async (type) => {
    const body = type.includes("json") ? JSON.stringify(Object.fromEntries(new URLSearchParams(credentials()))) : credentials();
    const response = await POST(request(body, type), context());
    expect(response.status).toBe(200);
    expect((await response.json()).url).toBe(origin);
    expect(response.headers.get("set-cookie")).toContain("session-token");
    expect(mocks.limit).toHaveBeenCalledWith("login", "driver@example.com");
    expect(mocks.compare).toHaveBeenCalledWith("password", "hash");
  });
  it("preserves CSRF rejection before password work", async () => {
    mocks.cookies = [];
    await POST(request(credentials()), context());
    expect(mocks.compare).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("returns real 429/Retry-After with the URL required by next-auth/react", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 83));
    const response = await POST(request(credentials()), context());
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("83");
    const result = await response.json(); expect(new URL(result.url).searchParams.get("error")).toBe("RateLimited");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("retains non-JSON failure redirects for context-dispatched extra path segments", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 61));
    const body = new URLSearchParams(credentials()); body.delete("json");
    const response = await POST(request(body.toString()), context(["callback", "credentials", "extra"]));
    expect(response.status).toBe(302); expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("RateLimited:61");
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("uses the same last duplicate form field as NextAuth for the login quota and lookup", async () => {
    await POST(request(credentials("first@example.com") + "&email=last%40example.com"), context());
    expect(mocks.limit).toHaveBeenCalledWith("login", "last@example.com");
    expect(mocks.user.mock.calls[0][0].where.email).toBe("last@example.com");
  });
  it.each(["application/json", "application/x-www-form-urlencoded"])("rejects oversized %s before parsing, quotas or password work", async (type) => {
    const response = await POST(request("x".repeat(16385), type), context());
    expect(response.status).toBe(413); expect(new URL((await response.json()).url).searchParams.get("error")).toBe("RequestTooLarge");
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("fails closed on quota failure", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(503, "Unavailable"));
    const response = await POST(request(credentials()), context());
    expect(response.status).toBe(503); expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("retains the existing GET CSRF endpoint", async () => {
    mocks.headers = new Headers();
    const response = await GET(new NextRequest(`${origin}/api/auth/csrf`), context(["csrf"]));
    expect(response.status).toBe(200); expect((await response.json()).csrfToken).toBe("test-csrf");
  });
});
