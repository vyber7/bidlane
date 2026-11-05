import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { uploadQuota: mocks } }));
import { uploadRetryAfter } from "./upload-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => { vi.clearAllMocks(); mocks.findUnique.mockResolvedValue(null); mocks.deleteMany.mockResolvedValue({ count: 0 }); mocks.upsert.mockImplementation(async ({ create }) => create); });
describe("shared upload budgets", () => {
  it("keeps the global admission cap atomic when concurrent prechecks all pass", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const results = await Promise.all(Array.from({ length: 110 }, (_, index) => uploadRetryAfter(`seller-${index}`, now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(100);
    expect(results.filter((wait) => wait === 3600)).toHaveLength(10);
  });
  it.each([["global:hour", 100, 3600], ["global:day", 500, 86400]] as const)("avoids new account buckets when %s is already full", async (key, count, wait) => {
    mocks.findUnique.mockImplementation(async ({ where }) => where.id.startsWith(key + ":") ? { count, expiresAt: new Date(now + wait * 1000) } : null);
    expect(await uploadRetryAfter("fresh-account", now)).toBe(wait);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.findUnique.mockRejectedValueOnce(new Error("down"));
    await expect(uploadRetryAfter("seller", now)).rejects.toThrow("down");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps subject-blocked attempts out of shared budgets under concurrency", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const results = await Promise.all(Array.from({ length: 140 }, () => uploadRetryAfter("seller", now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(40);
    expect(counts.get(`global:hour:${Math.floor(now / 3600_000)}`)).toBe(40);
    expect(counts.get(`global:day:${Math.floor(now / 86400_000)}`)).toBe(40);
    expect(await uploadRetryAfter("another", now)).toBe(0);
  });
  it("does not charge shared budgets when the account's daily allowance is exhausted", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith("user:seller:day:") ? 101 : 1 }));
    expect(await uploadRetryAfter("seller", now)).toBe(86400);
    expect(mocks.upsert.mock.calls.some(([input]) => input.where.id.startsWith("global:"))).toBe(false);
    expect(await uploadRetryAfter("another", now)).toBe(0);
  });
  it.each([["global:hour", 101, 3600], ["global:day", 501, 86400], ["user:seller:hour", 41, 3600], ["user:seller:day", 101, 86400]])("blocks exhausted %s budgets", async (key, count, wait) => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith(key + ":") ? count : 1 }));
    expect(await uploadRetryAfter("seller", now)).toBe(wait);
  });
  it("shares atomic counters across concurrent requests and accounts", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create, update }) => {
      expect(update).toEqual({ count: { increment: 1 } });
      const count = (counts.get(create.id) ?? 0) + 1; counts.set(create.id, count); return { ...create, count };
    });
    const results = await Promise.all(Array.from({ length: 41 }, () => uploadRetryAfter("seller", now)));
    expect(results.filter((result) => result === 0)).toHaveLength(40);
    expect(results.filter((result) => result > 0)).toHaveLength(1);
    expect(await uploadRetryAfter("another", now)).toBe(0);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: new Date(now) } } });
  });
  it("recovers a unique-key creation race without losing the quota increment", async () => {
    mocks.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    mocks.update.mockResolvedValue({ count: 101, expiresAt: new Date(now + 3600_000) });
    expect(await uploadRetryAfter("seller", now)).toBe(3600); expect(mocks.update).toHaveBeenCalled();
  });
  it("propagates storage errors instead of permitting uploads", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("down"));
    await expect(uploadRetryAfter("seller", now)).rejects.toThrow("down");
  });
});
