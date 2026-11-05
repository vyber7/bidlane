import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import type { Account, User } from "next-auth";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import type { OAuthConfig } from "next-auth/providers/oauth";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(), createUser: vi.fn(), findAccount: vi.fn(), createAccount: vi.fn(),
}));
vi.mock("./prismadb", () => ({ default: {
  user: { findUnique: mocks.findUser, create: mocks.createUser },
  account: { findUnique: mocks.findAccount, create: mocks.createAccount },
} }));
import { authOptions } from "./auth-config";

// Exercise the installed NextAuth login/linking engine and its production
// adapter error wrapper, rather than reimplementing their security decisions.
const load = createRequire(import.meta.url);
const core = join(dirname(load.resolve("next-auth")), "core");
const handleLogin = load(join(core, "lib/callback-handler.js")).default as (input: {
  sessionToken?: string;
  profile: User;
  account: Account;
  options: Record<string, unknown>;
}) => Promise<{ user: AdapterUser; isNewUser: boolean }>;
const { adapterErrorHandler } = load(join(core, "errors.js")) as {
  adapterErrorHandler: (adapter: Adapter, logger: { debug: (...args: unknown[]) => void; error: (...args: unknown[]) => void }) => Adapter;
};

type StoredUser = AdapterUser & { hashedPassword: string | null; sessionVersion: string };
const users = new Map<string, StoredUser>();
const accounts: AdapterAccount[] = [];
const secret = "account-linking-regression-test-secret";
const ownerId = "aaaaaaaaaaaaaaaaaaaaaaaa";

function existingUser(overrides: Partial<StoredUser> = {}) {
  const user: StoredUser = {
    id: ownerId, name: "Account owner", email: "owner@example.com",
    emailVerified: null, hashedPassword: "attacker-chosen-password-hash", sessionVersion: "before-reset",
    ...overrides,
  };
  users.set(user.id, user);
  return user;
}

async function sessionFor(user: StoredUser) {
  return encode({ secret, token: { sub: user.id, email: user.email, sessionVersion: user.sessionVersion } });
}

function login(providerId: string, email = "owner@example.com", sessionToken?: string, subject = "provider-owner") {
  const provider = authOptions.providers.find((item) => item.id === providerId) as OAuthConfig<unknown>;
  return handleLogin({
    sessionToken,
    profile: { id: subject, name: "OAuth owner", email },
    account: { provider: providerId, providerAccountId: subject, type: "oauth" },
    options: {
      adapter: adapterErrorHandler(authOptions.adapter!, { debug: vi.fn(), error: vi.fn() }),
      events: {}, session: authOptions.session,
      jwt: { ...authOptions.jwt, secret },
      provider: { ...provider, ...provider.options },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks(); users.clear(); accounts.length = 0;
  mocks.findUser.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
    where.id ? users.get(where.id) ?? null : [...users.values()].find((user) => user.email === where.email) ?? null,
  );
  mocks.createUser.mockImplementation(async ({ data }: { data: Omit<AdapterUser, "id"> }) =>
    existingUser({ ...data, id: "bbbbbbbbbbbbbbbbbbbbbbbb", hashedPassword: null, sessionVersion: "" }),
  );
  mocks.findAccount.mockImplementation(async ({ where }: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
    const identity = where.provider_providerAccountId;
    const account = accounts.find((item) => item.provider === identity.provider && item.providerAccountId === identity.providerAccountId);
    return account ? { user: users.get(account.userId) } : null;
  });
  mocks.createAccount.mockImplementation(async ({ data }: { data: AdapterAccount }) => {
    accounts.push(data);
    return data;
  });
});

describe.each(["github", "google"])("%s account-linking boundary", (provider) => {
  it.each([null, new Date("2026-01-01")])("rejects email-only merging into a password account (verified: %s)", async (emailVerified) => {
    const user = existingUser({ emailVerified });
    await expect(login(provider)).rejects.toMatchObject({ name: "AccountNotLinkedError" });
    expect(accounts).toHaveLength(0);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(users.get(user.id)).toBe(user);
  });

  it.each([null, new Date("2026-01-01")])("blocks provider planting through a signed-in password session (verified: %s)", async (emailVerified) => {
    const user = existingUser({ emailVerified });
    await expect(login(provider, "attacker@example.com", await sessionFor(user))).rejects.toMatchObject({ name: "LinkAccountError" });
    expect(accounts).toHaveLength(0);
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("rejects a revoked session and same-email merge after password recovery", async () => {
    const user = existingUser();
    const oldSession = await sessionFor(user);
    users.set(user.id, { ...user, hashedPassword: "recovered-password-hash", sessionVersion: "after-reset" });
    await expect(login(provider, user.email, oldSession)).rejects.toMatchObject({ name: "AccountNotLinkedError" });
    expect(accounts).toHaveLength(0);
  });

  it("creates a separate user and links its first OAuth identity on signup", async () => {
    const result = await login(provider);
    expect(result.isNewUser).toBe(true);
    expect(result.user.id).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(accounts).toEqual([expect.objectContaining({ provider, userId: result.user.id })]);
    expect(users.get(result.user.id)?.hashedPassword).toBeNull();
  });

  it("continues signing in an already linked provider subject, even if its email changes", async () => {
    const user = existingUser();
    accounts.push({ provider, providerAccountId: "provider-owner", userId: user.id, type: "oauth" });
    const result = await login(provider, "changed-provider-email@example.com");
    expect(result.user.id).toBe(user.id);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("does not merge a new subject into an OAuth-only user merely because the emails match", async () => {
    const user = existingUser({ hashedPassword: null });
    accounts.push({ provider, providerAccountId: "original-subject", userId: user.id, type: "oauth" });
    await expect(login(provider)).rejects.toMatchObject({ name: "AccountNotLinkedError" });
    expect(accounts).toHaveLength(1);
  });
});

it("fails closed if the account-link target is missing", async () => {
  await expect(authOptions.adapter!.linkAccount!({
    provider: "github", providerAccountId: "new-subject", userId: ownerId, type: "oauth",
  })).rejects.toThrow();
  expect(mocks.createAccount).not.toHaveBeenCalled();
});

it("fails closed if the target-user lookup is unavailable", async () => {
  mocks.findUser.mockRejectedValueOnce(new Error("Database unavailable"));
  await expect(authOptions.adapter!.linkAccount!({
    provider: "github", providerAccountId: "new-subject", userId: ownerId, type: "oauth",
  })).rejects.toThrow("Database unavailable");
  expect(mocks.createAccount).not.toHaveBeenCalled();
});
