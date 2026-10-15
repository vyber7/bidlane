import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), publish: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { notification: { findMany: mocks.findMany, findFirst: mocks.findFirst, count: mocks.count, updateMany: mocks.updateMany } } }));
vi.mock("@/app/libs/notifications", () => ({ publishNotificationChanges: mocks.publish }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { GET, PATCH } from "./route";

const id = "abcdef0123456789abcdef01";
const createdAt = new Date("2026-10-14T12:00:00Z");
const item = { id, userId: "buyer", eventKey: "private-event-key", kind: "bid", title: "You’ve been outbid", message: "Another bidder is leading.", createdAt, readAt: null, href: "/listing/car", actionLabel: "Bid again", tone: "warning" };
const get = (params = "") => GET(new Request(`http://localhost/api/notifications${params}`));
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "buyer" });
  mocks.findMany.mockResolvedValue([item]);
  mocks.findFirst.mockResolvedValue({ id, createdAt });
  mocks.count.mockResolvedValue(1);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("notification API", () => {
  it("requires a session before reading or changing any notification", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect((await patch({ ids: [id] })).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("scopes both feed and unread count to the signed-in account and omits private storage fields", async () => {
    const response = await get("?userId=someone-else");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const feed = await response.json();
    expect(feed).toMatchObject({ total: 1, unreadCount: 1, nextCursor: null, items: [expect.objectContaining({ id, readAt: null, createdAt: createdAt.toISOString() })] });
    expect(feed.items[0]).not.toHaveProperty("eventKey");
    expect(feed.items[0]).not.toHaveProperty("userId");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "buyer" }, take: 51 }));
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: "buyer", readAt: null } });
  });

  it("loads only a count for the header", async () => {
    await expect((await get("?summary=1")).json()).resolves.toEqual({ userId: "buyer", unreadCount: 1 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("paginates with stable timestamp and ID boundaries, even when the anchor is now read", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ ...item, id: String(i).padStart(24, "0") }));
    mocks.findMany.mockResolvedValue(items);
    const feed = await (await get(`?view=unread&cursor=${id}`)).json();
    expect(feed.items).toHaveLength(50);
    expect(feed.nextCursor).toBe(items[49].id);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id, userId: "buyer" }, select: { id: true, createdAt: true } });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "buyer", readAt: null, OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] } }));
  });

  it("rejects invalid and other-account cursors", async () => {
    expect((await get("?cursor=bad")).status).toBe(400);
    mocks.findFirst.mockResolvedValue(null);
    expect((await get(`?cursor=${id}`)).status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("only marks owned unread records and makes repeated reads a no-op", async () => {
    expect((await patch({ ids: [id, id], userId: "someone-else" })).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { userId: "buyer", readAt: null, id: { in: [id] } }, data: { readAt: expect.any(Date) } });
    expect(mocks.publish).toHaveBeenCalledWith(["buyer"]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await patch({ ids: [id] });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it("marks all only through the displayed cutoff, leaving newer arrivals unread", async () => {
    await patch({ all: true, before: createdAt.toISOString() });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { userId: "buyer", readAt: null, createdAt: { lte: createdAt } }, data: { readAt: expect.any(Date) } });
  });

  it.each([{}, { ids: [] }, { ids: ["bad"] }, { ids: Array(101).fill(id) }, { all: true }, { all: true, before: "bad" }, { all: true, before: "2099-01-01" }, { all: true, ids: [id], before: createdAt.toISOString() }])("rejects invalid read request %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns a retryable error without reporting a read when persistence fails", async () => {
    mocks.updateMany.mockRejectedValue(new Error("offline"));
    expect((await patch({ ids: [id] })).status).toBe(500);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
