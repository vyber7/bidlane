import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { uploadQuota: mocks } }));
import { uploadRetryAfter } from "./upload-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => { vi.clearAllMocks(); mocks.deleteMany.mockResolvedValue({ count: 0 }); mocks.upsert.mockImplementation(async ({ create }) => create); });
describe("shared upload budgets", () => {
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
