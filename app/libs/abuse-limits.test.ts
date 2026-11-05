import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { abuseQuota: mocks } }));
import { abusePolicies, enforceAbuseLimit, type AbuseAction } from "./abuse-limits";
const now = Date.UTC(2026, 10, 5);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXTAUTH_SECRET", "quota-test-secret"); mocks.findUnique.mockResolvedValue(null); mocks.deleteMany.mockResolvedValue({ count: 0 }); mocks.upsert.mockImplementation(async ({ create }) => create); });
afterEach(() => vi.unstubAllEnvs());
describe("shared abuse limits", () => {
  it.each(Object.keys(abusePolicies) as AbuseAction[])("isolates blocked %s subjects from shared budgets", async (action) => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const limit = abusePolicies[action].subject[0][0];
    const results = await Promise.allSettled(Array.from({ length: abusePolicies[action].global[0][0] + 10 }, (_, index) =>
      enforceAbuseLimit(action, index % 2 ? " Driver@EXAMPLE.com " : "driver@example.com", now),
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(limit);
    for (const [key, count] of counts) if (key.includes(":global:")) expect(count).toBe(limit);
    await expect(enforceAbuseLimit(action, "another@example.com", now)).resolves.toBeUndefined();
  });
  it("does not charge global budgets for an exhausted longer subject window", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith("comment:subject:") && create.id.includes(":3600000:") ? 31 : 1 }));
    await expect(enforceAbuseLimit("comment", "user", now)).rejects.toMatchObject({ status: 429, retryAfter: 3600 });
    expect(mocks.upsert.mock.calls.some(([input]) => input.where.id.includes(":global:"))).toBe(false);
  });
  it.each(Object.keys(abusePolicies) as Array<keyof typeof abusePolicies>)("blocks the exhausted %s subject budget", async (action) => {
    const limit = abusePolicies[action].subject[0][0];
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.includes(":subject:") ? limit + 1 : 1 }));
    await expect(enforceAbuseLimit(action, "user@example.com", now)).rejects.toMatchObject({ status: 429, retryAfter: abusePolicies[action].subject[0][1] / 1000 });
  });
  it("uses one privacy-preserving identity for case/space variants", async () => {
    await enforceAbuseLimit("login", " Driver@example.com ", now);
    await enforceAbuseLimit("login", "driver@EXAMPLE.com", now);
    const subjects = mocks.upsert.mock.calls.map(([input]) => input.where.id).filter((id) => id.includes(":subject:"));
    expect(subjects).toHaveLength(2);
    expect(subjects[0]).toBe(subjects[1]);
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("example.com");
    expect(subjects[0]).toMatch(/subject:[a-f0-9]{64}:/);
  });
  it.each(Object.keys(abusePolicies) as AbuseAction[])("preserves the global %s admission cap under concurrent distinct subjects", async (action) => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const limit = abusePolicies[action].global[0][0];
    const results = await Promise.allSettled(Array.from({ length: limit + 5 }, (_, index) => enforceAbuseLimit(action, `user-${index}`, now)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(limit);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 429, retryAfter: 60 });
  });
  it("rejects known global exhaustion without allocating subject buckets", async () => {
    mocks.findUnique.mockResolvedValue({ count: 100 });
    await expect(enforceAbuseLimit("login", "rotating@example.com", now)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([["login", 60000, 101, 60], ["login", 3600000, 1001, 3600], ["registration", 60000, 11, 60], ["registration", 3600000, 101, 3600], ["bid", 60000, 601, 60], ["comment", 60000, 121, 60]] as const)("enforces the %s %i global cap even when its precheck was stale", async (action, window, count, retryAfter) => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith(`${action}:global:${window}:`) ? count : 1 }));
    await expect(enforceAbuseLimit(action, "fresh-user", now)).rejects.toMatchObject({ status: 429, retryAfter });
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.findUnique.mockRejectedValueOnce(new Error("down"));
    await expect(enforceAbuseLimit("login", "user", now)).rejects.toMatchObject({ status: 503 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("enforces atomic budgets under concurrent requests", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create, update }) => {
      expect(update).toEqual({ count: { increment: 1 } });
      const count = (counts.get(create.id) ?? 0) + 1; counts.set(create.id, count); return { ...create, count };
    });
    const results = await Promise.allSettled(Array.from({ length: 11 }, () => enforceAbuseLimit("login", "driver@example.com", now)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(enforceAbuseLimit("login", "another@example.com", now)).resolves.toBeUndefined();
  });
  it("recovers the unique-key race and fails closed on storage/configuration errors", async () => {
    mocks.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    mocks.update.mockResolvedValue({ count: 101 });
    await expect(enforceAbuseLimit("login", "user", now)).rejects.toMatchObject({ status: 429 });
    expect(mocks.update).toHaveBeenCalled();
    mocks.upsert.mockRejectedValueOnce(new Error("private DB error"));
    await expect(enforceAbuseLimit("bid", "user", now)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("NEXTAUTH_SECRET", "");
    await expect(enforceAbuseLimit("bid", "user", now)).rejects.toMatchObject({ status: 503 });
  });
  it("permits a new bucket after the previous time window expires", async () => {
    await enforceAbuseLimit("comment", "user", now);
    await enforceAbuseLimit("comment", "user", now + 60000);
    const globals = mocks.upsert.mock.calls.map(([input]) => input.where.id).filter((id) => id.startsWith("comment:global:"));
    expect(globals).toHaveLength(2);
    expect(globals[0]).not.toBe(globals[1]);
    expect(mocks.deleteMany).toHaveBeenLastCalledWith({ where: { expiresAt: { lte: new Date(now + 60000) } } });
  });
});
