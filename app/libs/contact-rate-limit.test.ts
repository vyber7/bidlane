import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { contactRateLimit: mocks } }));
import { contactRetryAfter } from "./contact-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(null);
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.upsert.mockImplementation(async ({ create }) => create);
});
describe("shared contact quotas", () => {
  it("keeps the global admission cap atomic when concurrent prechecks all pass", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => contactRetryAfter(`sender-${index}@example.com`, now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(30);
    expect(results.filter((wait) => wait === 60)).toHaveLength(10);
  });
  it("keeps repeated blocked senders from exhausting other senders' quota", async () => {
    const counts = new Map<string, number>();
    mocks.upsert.mockImplementation(async ({ create }) => {
      const count = (counts.get(create.id) ?? 0) + 1;
      counts.set(create.id, count);
      return { ...create, count };
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => contactRetryAfter(index % 2 ? "Alex@example.com" : "alex@EXAMPLE.com", now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(3);
    expect(counts.get(`global:${Math.floor(now / 60_000)}`)).toBe(3);
    expect(await contactRetryAfter("another@example.com", now)).toBe(0);
  });
  it("uses atomic increments and case-insensitive email hashes", async () => {
    expect(await contactRetryAfter("Alex@example.com", now)).toBe(0);
    await contactRetryAfter("alex@example.com", now);
    expect(mocks.upsert.mock.calls[0][0].where).toEqual(mocks.upsert.mock.calls[2][0].where);
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("example.com");
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({ count: { increment: 1 } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: new Date(now) } } });
  });
  it("blocks the fourth email attempt until the fifteen-minute window ends", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith("email:") ? 4 : 1 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(900);
  });
  it("blocks the global budget without creating another email bucket", async () => {
    mocks.findUnique.mockResolvedValue({ count: 30, expiresAt: new Date(now + 60_000) });
    expect(await contactRetryAfter("a@example.com", now)).toBe(60);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("enforces the global cap even when the precheck was stale", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith("global:") ? 31 : 1 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(60);
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.findUnique.mockRejectedValueOnce(new Error("down"));
    await expect(contactRetryAfter("a@example.com", now)).rejects.toThrow("down");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("handles concurrent bucket creation via the unique key", async () => {
    mocks.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    mocks.update.mockResolvedValue({ count: 2, expiresAt: new Date(now + 60_000) });
    expect(await contactRetryAfter("a@example.com", now)).toBe(0);
    expect(mocks.update).toHaveBeenCalledWith({ where: mocks.upsert.mock.calls[0][0].where, data: { count: { increment: 1 } } });
  });
});
