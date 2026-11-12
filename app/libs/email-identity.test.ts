import { MongoServerError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialsConfig } from "next-auth/providers/credentials";

const mocks = vi.hoisted(() => ({
  first: vi.fn(), many: vi.fn(), unique: vi.fn(), create: vi.fn(), send: vi.fn(),
  claim: vi.fn(), jobs: vi.fn(), job: vi.fn(), finish: vi.fn(), reset: vi.fn(), bind: vi.fn(),
}));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({
  users: { byEmail: mocks.unique, byId: mocks.unique, sessionIdentity: mocks.unique, emailMatches: mocks.many, passwordMatches: mocks.many, emailExists: mocks.first, create: mocks.create },
  recoveryEmails: { candidates: mocks.jobs, find: mocks.job, claim: mocks.claim, finish: mocks.finish, deleteCompletedBefore: vi.fn() },
  passwordResets: { find: mocks.reset, bind: mocks.bind, deleteBefore: vi.fn() },
}), withNativeTransaction: vi.fn() }));
vi.mock("./abuse-limits", () => ({ enforceAbuseLimit: vi.fn() }));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn(async () => "hash"), compare: vi.fn(async () => true) } }));
vi.mock("./outbid-email", async (importOriginal) => ({ ...await importOriginal<typeof import("./outbid-email")>(), sendEmail: mocks.send }));

import { POST } from "@/app/api/register/route";
import { authOptions } from "./auth-config";
import { resetHash, resetToken } from "./password-reset";
import { sendRecoveryEmails } from "./recovery-email-delivery";

type StoredUser = { id: string; email: string; hashedPassword: string | null; sessionVersion: string; emailVerified: Date | null };
const users = new Map<string, StoredUser>();
const request = (email: string) => new Request("http://localhost/api/register", {
  method: "POST", body: JSON.stringify({ email, name: "Driver", password: "a long password" }),
});
const oauthCreate = (email: string) => authOptions.adapter!.createUser!({ email, name: "Driver", emailVerified: null });

beforeEach(() => {
  vi.clearAllMocks(); users.clear();
  vi.stubEnv("NEXTAUTH_SECRET", "email-identity-test-secret");
  vi.stubEnv("NEXTAUTH_URL", "https://bidlane.net");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "BidLane <alerts@bidlane.net>");
  mocks.many.mockImplementation(async (email) => {
    return [...users.values()].filter((user) => user.email.toLowerCase() === email.toLowerCase()).slice(0, 2);
  });
  mocks.first.mockImplementation(async (email) => {
    return [...users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  });
  mocks.unique.mockImplementation(async (email) => [...users.values()].find((user) => user.email === email) ?? null);
  // Model MongoDB's existing exact User.email unique index, not an insensitive index.
  mocks.create.mockImplementation(async (data) => {
    if ([...users.values()].some((user) => user.email === data.email)) {
      throw new MongoServerError({ message: "Unique email", code: 11000 });
    }
    const user = { id: `user-${users.size}`, emailVerified: null, hashedPassword: null, sessionVersion: "", ...data };
    users.set(user.id, user);
    return user;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("email identity across real account entry points", () => {
  it.each(["owner@example.com", "Owner@Example.COM"])("rejects the attack and still delivers the victim's recovery link: %s", async (email) => {
    const victim = { id: "victim", email, hashedPassword: "hash", sessionVersion: "v1", emailVerified: null };
    users.set(victim.id, victim);
    expect((await POST(request("OWNER@EXAMPLE.COM"))).status).toBe(409);
    await expect(oauthCreate("Owner@EXAMPLE.COM")).rejects.toMatchObject({ status: 409 });
    expect(users.size).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();

    const nonce = "test-nonce", id = "test-reset";
    mocks.reset.mockResolvedValue({ id, email: "owner@example.com", nonce, tokenHash: resetHash(resetToken(id, nonce)), usedAt: null, userId: null, expiresAt: new Date(Date.now() + 1800000) });
    let job = { id: "job", kind: "RESET", email: "OWNER@EXAMPLE.COM", resetId: id, nonce, attempts: 1, createdAt: new Date(), lockToken: "" };
    mocks.jobs.mockResolvedValue([{ id: job.id }]);
    mocks.job.mockImplementation(async () => job);
    mocks.claim.mockImplementation(async (_id, _now, lockToken) => { job.lockToken = lockToken; return { count: 1 }; });
    mocks.finish.mockImplementation(async (_id, _lockToken, data) => { job = { ...job, ...data }; return { count: 1 }; });
    mocks.bind.mockResolvedValue({ count: 1 });
    mocks.send.mockResolvedValue("sent");
    expect(await sendRecoveryEmails()).toMatchObject({ sent: 1, skipped: 0 });
    expect(mocks.send.mock.calls[0][1].to).toEqual([email]);
    expect(users.get(victim.id)).toEqual(victim);
  });

  it("allows immediate mixed-case signup/login without changing stored session identity", async () => {
    expect((await POST(request(" New.Driver@EXAMPLE.COM "))).status).toBe(201);
    const provider = authOptions.providers.find((provider) => provider.id === "credentials") as CredentialsConfig;
    const user = await provider.options!.authorize!({ email: "New.Driver@EXAMPLE.COM", password: "a long password" }, { body: {}, query: {}, headers: {}, method: "POST" });
    expect(user).toMatchObject({ email: "new.driver@example.com" });
    expect(users.size).toBe(1);
  });

  it.each(["password", "oauth", "mixed"])("concurrent %s signups share the same database uniqueness key", async (kind) => {
    let release!: () => void;
    const bothChecked = new Promise<void>((resolve) => { release = resolve; });
    let checks = 0;
    mocks.first.mockImplementation(async () => {
      if (++checks === 2) release();
      await bothChecked;
      return null; // Both requests observed availability before either inserted.
    });
    const first = kind === "oauth" ? oauthCreate("driver@example.com") : POST(request("driver@example.com"));
    const second = kind === "password" ? POST(request("DRIVER@EXAMPLE.COM")) : oauthCreate("DRIVER@EXAMPLE.COM");
    const results = await Promise.allSettled([first, second]);
    const successes = results.filter((result) => result.status === "fulfilled" && (!(result.value instanceof Response) || result.value.status === 201));
    expect(successes).toHaveLength(1);
    expect(users.size).toBe(1);
    expect(mocks.create.mock.calls.map(([args]) => args.email)).toEqual(["driver@example.com", "driver@example.com"]);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: 11000 });
      else if (result.value instanceof Response && result.value.status !== 201) expect(result.value.status).toBe(409);
    }
  });

  it.each(["drıver@example.com", "driver@éxample.com", "a\u0000@example.com", "driver@example.com\nattacker@example.com"])("rejects unsupported alternate representations at OAuth creation: %s", async (email) => {
    await expect(oauthCreate(email)).rejects.toMatchObject({ status: 400 });
    expect(mocks.first).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps dot and plus aliases distinct", async () => {
    await oauthCreate("first.last@example.com");
    expect((await POST(request("firstlast@example.com"))).status).toBe(201);
    expect((await POST(request("first.last+tag@example.com"))).status).toBe(201);
    expect(users.size).toBe(3);
  });
});
