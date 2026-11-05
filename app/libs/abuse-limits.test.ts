import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { abuseQuota: mocks } }));
import { abusePolicies, enforceAbuseLimit } from "./abuse-limits";
const now = Date.UTC(2026, 10, 5);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXTAUTH_SECRET", "quota-test-secret"); mocks.deleteMany.mockResolvedValue({ count: 0 }); mocks.upsert.mockImplementation(async ({ create }) => create); });
afterEach(() => vi.unstubAllEnvs());
describe("shared abuse limits", () => {
  it.each(Object.keys(abusePolicies) as Array<keyof typeof abusePolicies>)("blocks the exhausted %s subject budget", async (action) => {
    const limit = abusePolicies[action].subject[0][0];
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.includes(":subject:") ? limit + 1 : 1 }));
    await expect(enforceAbuseLimit(action, "user@example.com", now)).rejects.toMatchObject({ status: 429, retryAfter: abusePolicies[action].subject[0][1] / 1000 });
  });
  it("uses one privacy-preserving identity for case/space variants", async () => {
    await enforceAbuseLimit("login", " Driver@example.com ", now);
    const first = mocks.upsert.mock.calls[2][0].where.id;
    await enforceAbuseLimit("login", "driver@EXAMPLE.com", now);
    expect(mocks.upsert.mock.calls[5][0].where.id).toBe(first);
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("example.com");
    expect(first).toMatch(/subject:[a-f0-9]{64}:/);
  });
  it("blocks global rotating-address abuse before allocating subject buckets", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: 101 }));
    await expect(enforceAbuseLimit("login", "rotating@example.com", now)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
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
    const first = mocks.upsert.mock.calls[1][0].where.id;
    await enforceAbuseLimit("comment", "user", now + 60000);
    expect(mocks.upsert.mock.calls[4][0].where.id).not.toBe(first);
    expect(mocks.deleteMany).toHaveBeenLastCalledWith({ where: { expiresAt: { lte: new Date(now + 60000) } } });
  });
});
