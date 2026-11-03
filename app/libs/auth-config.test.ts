import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsConfig } from "next-auth/providers/credentials";
const mocks = vi.hoisted(() => ({ user: vi.fn(), compare: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { user: { findUnique: mocks.user } } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
import { authOptions } from "./auth-config";
beforeEach(() => { vi.clearAllMocks(); mocks.compare.mockResolvedValue(true); });
describe("session version issuance", () => {
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
