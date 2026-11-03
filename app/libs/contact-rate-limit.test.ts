import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { contactRateLimit: mocks } }));
import { contactRetryAfter } from "./contact-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  mocks.upsert.mockImplementation(async ({ create }) => create);
});
describe("shared contact quotas", () => {
  it("uses atomic increments and case-insensitive email hashes", async () => {
    expect(await contactRetryAfter("Alex@example.com", now)).toBe(0);
    await contactRetryAfter("alex@example.com", now);
    expect(mocks.upsert.mock.calls[1][0].where).toEqual(mocks.upsert.mock.calls[3][0].where);
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("example.com");
    expect(mocks.upsert.mock.calls[1][0].update).toEqual({ count: { increment: 1 } });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: new Date(now) } } });
  });
  it("blocks the fourth email attempt until the fifteen-minute window ends", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: create.id.startsWith("email:") ? 4 : 1 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(900);
  });
  it("blocks the global budget without creating another email bucket", async () => {
    mocks.upsert.mockImplementation(async ({ create }) => ({ ...create, count: 31 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(60);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("handles concurrent bucket creation via the unique key", async () => {
    mocks.upsert.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    mocks.update.mockResolvedValue({ count: 2, expiresAt: new Date(now + 60_000) });
    expect(await contactRetryAfter("a@example.com", now)).toBe(0);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: `global:${Math.floor(now / 60_000)}` }, data: { count: { increment: 1 } } });
  });
});
