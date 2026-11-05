import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { githubUserinfo } from "./github-userinfo";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), user: vi.fn(), users: vi.fn(), compare: vi.fn() }));
vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("./prismadb", () => ({ default: { user: { findUnique: mocks.user, findMany: mocks.users } } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
import { authOptions } from "./auth-config";
import { ApiRequestError } from "./api-request";
beforeEach(() => { vi.clearAllMocks(); mocks.limit.mockResolvedValue(undefined); mocks.compare.mockResolvedValue(true); mocks.users.mockResolvedValue([]); });
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
  it.each(["Legacy@Example.COM", "new@example.com"])("signs in with varied case while returning stored email: %s", async (storedEmail) => {
    mocks.user.mockResolvedValue(null);
    mocks.users.mockResolvedValue([{ id: "user", email: storedEmail, hashedPassword: "hash", sessionVersion: "v1" }]);
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const user = await provider.options!.authorize!({ email: storedEmail.toUpperCase(), password: "password" }, { body: {}, query: {}, headers: {}, method: "POST" });
    expect(user).toMatchObject({ id: "user", email: storedEmail, sessionVersion: "v1" });
    expect(mocks.compare).toHaveBeenCalledWith("password", "hash");
  });
  it("never chooses a case-insensitive match from ambiguous legacy accounts", async () => {
    mocks.user.mockResolvedValue(null);
    mocks.users.mockResolvedValue([{ id: "one", email: "User@example.com", hashedPassword: "one" }, { id: "two", email: "user@example.com", hashedPassword: "two" }]);
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    await expect(provider.options!.authorize!({ email: "USER@example.com", password: "password" }, { body: {}, query: {}, headers: {}, method: "POST" })).rejects.toThrow("Invalid Credentials");
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("retains exact legacy access even when case-colliding accounts exist", async () => {
    mocks.user.mockResolvedValue({ id: "exact-user", email: "User@example.com", hashedPassword: "hash" });
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    expect(await provider.options!.authorize!({ email: "User@example.com", password: "password" }, { body: {}, query: {}, headers: {}, method: "POST" })).toMatchObject({ id: "exact-user", email: "User@example.com" });
    expect(mocks.users).not.toHaveBeenCalled();
  });
  it("enforces login quotas before lookup/bcrypt and bounds credential fields", async () => {
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const authorize = provider.options!.authorize!;
    const request = { body: {}, query: {}, headers: {}, method: "POST" };
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 10));
    await expect(authorize({ email: "user@example.com", password: "password" }, request)).rejects.toThrow("RateLimited:10");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
    mocks.limit.mockClear();
    await expect(authorize({ email: "user@example.com", password: "é".repeat(36) + "a" }, request)).rejects.toThrow("Invalid Credentials");
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it.each(["a".repeat(73), "😀".repeat(18) + "a"])("rejects more than 72 bytes before password comparison", async (password) => {
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    await expect(provider.options!.authorize!({ email: "user@example.com", password }, { body: {}, query: {}, headers: {}, method: "POST" })).rejects.toThrow("Invalid Credentials");
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it.each(["a", "a".repeat(72), "é".repeat(36), "😀".repeat(18)])("compares legacy short passwords and exact byte boundaries unchanged: %s", async (password) => {
    mocks.user.mockResolvedValue({ id: "user", email: "user@example.com", hashedPassword: "hash" });
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const user = await provider.options!.authorize!({ email: "user@example.com", password }, { body: {}, query: {}, headers: {}, method: "POST" });
    expect(user).toMatchObject({ id: "user" });
    expect(mocks.compare).toHaveBeenCalledWith(password, "hash");
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
