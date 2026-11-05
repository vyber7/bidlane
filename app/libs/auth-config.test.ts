import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { githubUserinfo } from "./github-userinfo";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), user: vi.fn(), compare: vi.fn() }));
vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("./prismadb", () => ({ default: { user: { findUnique: mocks.user } } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
import { authOptions } from "./auth-config";
import { ApiRequestError } from "./api-request";
beforeEach(() => { vi.clearAllMocks(); mocks.limit.mockResolvedValue(undefined); mocks.compare.mockResolvedValue(true); });
describe("OAuth account linking", () => {
  it("disables email-only account linking while keeping GitHub email verification", () => {
    const github = authOptions.providers.find((provider) => provider.id === "github") as OAuthConfig<unknown>;
    expect(github.options?.allowDangerousEmailAccountLinking).not.toBe(true);
    expect(github.options?.userinfo).toBe(githubUserinfo);
    const google = authOptions.providers.find((provider) => provider.id === "google") as OAuthConfig<unknown>;
    expect(google.options?.allowDangerousEmailAccountLinking).not.toBe(true);
  });
});
describe("session version issuance", () => {
  it("enforces login quotas before lookup/bcrypt and bounds credential fields", async () => {
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const authorize = provider.options!.authorize!;
    const request = { body: {}, query: {}, headers: {}, method: "POST" };
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 10));
    await expect(authorize({ email: "user@example.com", password: "password" }, request)).rejects.toThrow("RateLimited:10");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
    mocks.limit.mockClear();
    await expect(authorize({ email: "user@example.com", password: "é".repeat(513) }, request)).rejects.toThrow("Invalid Credentials");
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("captures the version before password comparison so a racing reset cannot bless an old login", async () => {
    mocks.user.mockResolvedValue({ id: "user", email: "user@example.com", hashedPassword: "old-hash", sessionVersion: "old-version" });
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const user = await provider.options!.authorize!({ email: "user@example.com", password: "password" }, { body: {}, query: {}, headers: {}, method: "POST" });
    expect(user).toMatchObject({ sessionVersion: "old-version" });
    mocks.user.mockResolvedValue({ sessionVersion: "new-version" });
    const token = await authOptions.callbacks!.jwt!({ token: {}, user: user!, account: { provider: "credentials", type: "credentials", providerAccountId: "user" } });
    expect(token.sessionVersion).toBe("old-version");
  });
  it("issues the current version for a fresh OAuth login", async () => {
    mocks.user.mockResolvedValue({ sessionVersion: "new-version" });
    const token = await authOptions.callbacks!.jwt!({ token: {}, user: { id: "user" }, account: { provider: "google", type: "oauth", providerAccountId: "provider-user" } });
    expect(token.sessionVersion).toBe("new-version");
  });
  it("does not accept a newer session version from session update input", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    // NextAuth v4 omits user on refresh/update despite marking it required in its callback type.
    const token = await jwt({ token: { sessionVersion: "old" }, trigger: "update", session: { sessionVersion: "new" } } as unknown as Parameters<typeof jwt>[0]);
    expect(token.sessionVersion).toBe("old"); expect(mocks.user).not.toHaveBeenCalled();
  });
});
