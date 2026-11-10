import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), consume: vi.fn(), deleteExpired: vi.fn() }));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({ quotas: { contact: mocks } }) }));
import { contactRetryAfter } from "./contact-rate-limit";
const now = Date.UTC(2026, 10, 2);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(null);
  mocks.deleteExpired.mockResolvedValue({ count: 0 });
  mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: 1 }));
});
describe("shared contact quotas", () => {
  it("keeps the global admission cap atomic when concurrent prechecks all pass", async () => {
    const counts = new Map<string, number>();
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => contactRetryAfter(`sender-${index}@example.com`, now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(30);
    expect(results.filter((wait) => wait === 60)).toHaveLength(10);
  });
  it("keeps repeated blocked senders from exhausting other senders' quota", async () => {
    const counts = new Map<string, number>();
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      return { id, expiresAt, count };
    });
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => contactRetryAfter(index % 2 ? "Alex@example.com" : "alex@EXAMPLE.com", now)));
    expect(results.filter((wait) => wait === 0)).toHaveLength(3);
    expect(counts.get(`global:${Math.floor(now / 60_000)}`)).toBe(3);
    expect(await contactRetryAfter("another@example.com", now)).toBe(0);
  });
  it("uses atomic increments and case-insensitive email hashes", async () => {
    expect(await contactRetryAfter("Alex@example.com", now)).toBe(0);
    await contactRetryAfter("alex@example.com", now);
    expect(mocks.consume.mock.calls[0][0]).toEqual(mocks.consume.mock.calls[2][0]);
    expect(JSON.stringify(mocks.consume.mock.calls)).not.toContain("example.com");
    expect(mocks.deleteExpired).toHaveBeenCalledWith(new Date(now));
  });
  it("blocks the fourth email attempt until the fifteen-minute window ends", async () => {
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: id.startsWith("email:") ? 4 : 1 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(900);
  });
  it("blocks the global budget without creating another email bucket", async () => {
    mocks.read.mockResolvedValue({ count: 30, expiresAt: new Date(now + 60_000) });
    expect(await contactRetryAfter("a@example.com", now)).toBe(60);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("enforces the global cap even when the precheck was stale", async () => {
    mocks.consume.mockImplementation(async (id: string, expiresAt: Date) => ({ id, expiresAt, count: id.startsWith("global:") ? 31 : 1 }));
    expect(await contactRetryAfter("a@example.com", now)).toBe(60);
  });
  it("fails closed when a global precheck cannot be read", async () => {
    mocks.read.mockRejectedValueOnce(new Error("down"));
    await expect(contactRetryAfter("a@example.com", now)).rejects.toThrow("down");
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
