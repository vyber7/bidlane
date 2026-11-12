import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), consume: vi.fn(), deleteExpired: vi.fn() }));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({ quotas: { upload: mocks } }) }));
import { uploadRetryAfter } from "./upload-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(null); mocks.deleteExpired.mockResolvedValue({ count: 0 }); mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: 1 })); });
describe("shared upload budgets", () => {
  it("keeps the global admission cap atomic when concurrent prechecks all pass", async () => {
    const counts = new Map<string, number>();
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 110 }, (_, index) => uploadRetryAfter(`seller-${index}`, now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(100);
    expect(results.filter((wait) => wait === 3600)).toHaveLength(10);
  });
  it.each([["global:hour", 100, 3600], ["global:day", 500, 86400]] as const)("avoids new account buckets when %s is already full", async (key, count, wait) => {
    mocks.read.mockImplementation(async (id: string) => id.startsWith(key + ":") ? { count, expiresAt: new Date(now + wait * 1000) } : null);
    expect(await uploadRetryAfter("fresh-account", now)).toBe(wait);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.read.mockRejectedValueOnce(new Error("down"));
    await expect(uploadRetryAfter("seller", now)).rejects.toThrow("down");
    expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("keeps subject-blocked attempts out of shared budgets under concurrency", async () => {
    const counts = new Map<string, number>();
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 140 }, () => uploadRetryAfter("seller", now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(40);
    expect(counts.get(`global:hour:${Math.floor(now / 3600_000)}`)).toBe(40);
    expect(counts.get(`global:day:${Math.floor(now / 86400_000)}`)).toBe(40);
    expect(await uploadRetryAfter("another", now)).toBe(0);
  });
  it("does not charge shared budgets when the account's daily allowance is exhausted", async () => {
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: id.startsWith("user:seller:day:") ? 101 : 1 }));
    expect(await uploadRetryAfter("seller", now)).toBe(86400);
    expect(mocks.consume.mock.calls.some(([input]) => input.startsWith("global:"))).toBe(false);
    expect(await uploadRetryAfter("another", now)).toBe(0);
  });
  it.each([["global:hour", 101, 3600], ["global:day", 501, 86400], ["user:seller:hour", 41, 3600], ["user:seller:day", 101, 86400]])("blocks exhausted %s budgets", async (key, count, wait) => {
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: id.startsWith(key + ":") ? count : 1 }));
    expect(await uploadRetryAfter("seller", now)).toBe(wait);
  });
  it("shares atomic counters across concurrent requests and accounts", async () => {
    const counts = new Map<string, number>();
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1; counts.set(id, count); return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 41 }, () => uploadRetryAfter("seller", now)));
    expect(results.filter((result) => result === 0)).toHaveLength(40);
    expect(results.filter((result) => result > 0)).toHaveLength(1);
    expect(await uploadRetryAfter("another", now)).toBe(0);
    expect(mocks.deleteExpired).toHaveBeenCalledWith(new Date(now));
  });
  it("propagates storage errors instead of permitting uploads", async () => {
    mocks.consume.mockRejectedValueOnce(new Error("down"));
    await expect(uploadRetryAfter("seller", now)).rejects.toThrow("down");
  });
});
