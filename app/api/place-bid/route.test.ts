import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  transaction: vi.fn(),
  listingFindUnique: vi.fn(),
  listingUpdateMany: vi.fn(),
  listingUpdate: vi.fn(),
  bidCreate: vi.fn(),
  userUpdate: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: { $transaction: mocks.transaction },
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");
const tx = {
  listing: {
    findUnique: mocks.listingFindUnique,
    updateMany: mocks.listingUpdateMany,
    update: mocks.listingUpdate,
  },
  bid: { create: mocks.bidCreate },
  user: { update: mocks.userUpdate },
};

function request(body: unknown) {
  return new Request("http://localhost/api/place-bid", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function liveListing(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    userId: "seller",
    status: "LIVE",
    auctionStartsAt: new Date("2026-09-04T11:00:00.000Z"),
    auctionEndsAt: new Date("2026-09-04T13:00:00.000Z"),
    startingBid: 1_000,
    currentBid: null,
    bidIncrement: 100,
    ...overrides,
  };
}

describe("POST /api/place-bid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getCurrentUser.mockResolvedValue({ id: "bidder", email: "bidder@test.dev" });
    mocks.transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    mocks.listingFindUnique.mockResolvedValue(liveListing());
    mocks.listingUpdateMany.mockResolvedValue({ count: 1 });
    mocks.listingUpdate.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
    mocks.bidCreate.mockResolvedValue({
      id: "bid-1",
      amount: 1_000,
      createdAt: now,
      listingId,
      userId: "bidder",
      user: { name: "Buyer" },
    });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("requires authentication before opening a transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request({ listingId, bidAmount: 1_000 }))).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects sellers bidding on their own listings", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ userId: "bidder" }));

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(403);
    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["not live", { status: "UPCOMING" }],
    ["not started", { auctionStartsAt: new Date("2026-09-04T12:00:01.000Z") }],
    ["already ended", { auctionEndsAt: now }],
  ])("rejects an auction that is %s", async (_scenario, overrides) => {
    void _scenario;
    mocks.listingFindUnique.mockResolvedValue(liveListing(overrides));

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction is not open for bidding",
    });
  });

  it("enforces the starting bid and subsequent increment", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ currentBid: 1_500 }));

    const response = await POST(request({ listingId, bidAmount: 1_599 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bid must be at least 1600",
    });
    expect(mocks.bidCreate).not.toHaveBeenCalled();
  });

  it("places a bid and updates bidder relationships atomically", async () => {
    const response = await POST(request({ listingId, bidAmount: "1000" }));

    expect(response.status).toBe(201);
    expect(mocks.listingUpdateMany).toHaveBeenCalledWith({
      where: {
        id: listingId,
        status: "LIVE",
        currentBid: null,
        auctionEndsAt: new Date("2026-09-04T13:00:00.000Z"),
      },
      data: {
        currentBid: 1_000,
        highestBidderId: "bidder",
        auctionEndsAt: new Date("2026-09-04T13:00:00.000Z"),
      },
    });
    expect(mocks.bidCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 1_000,
          listingId,
          userId: "bidder",
        }),
      })
    );
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: listingId },
      data: { bidders: { connect: { id: "bidder" } } },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "bidder" },
      data: { bidOnList: { connect: { id: listingId } } },
    });
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "new-bid",
      expect.objectContaining({ id: "bid-1" })
    );
  });

  it("extends an auction to two minutes from a last-minute bid", async () => {
    mocks.listingFindUnique.mockResolvedValue(
      liveListing({ auctionEndsAt: new Date("2026-09-04T12:01:00.000Z") })
    );

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(201);
    expect(mocks.listingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auctionEndsAt: new Date("2026-09-04T12:02:00.000Z"),
        }),
      })
    );
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "new-end-time",
      { newEndTime: new Date("2026-09-04T12:02:00.000Z") }
    );
  });

  it("rejects a bid that loses the optimistic-lock race", async () => {
    mocks.listingUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(409);
    expect(mocks.bidCreate).not.toHaveBeenCalled();
  });

  it("returns a committed bid even if real-time notification fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("Pusher unavailable"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(201);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"bid.notification_failed"')
    );
    consoleWarn.mockRestore();
  });
});
