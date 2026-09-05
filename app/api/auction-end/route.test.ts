import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");

function request(body: unknown = { listingId }) {
  return new Request("http://localhost/api/auction-end", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auction-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getCurrentUser.mockResolvedValue({ id: "seller", email: "seller@test.dev" });
    mocks.findUnique.mockResolvedValue({
      id: listingId,
      userId: "seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
      currentBid: 12_000,
      reservePrice: 10_000,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request())).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("allows only the listing seller to end the auction", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "another-seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not allow an auction to end early", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T12:00:01.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction cannot end before its scheduled time",
    });
  });

  it.each([
    [null, 10_000, "RESERVE_NOT_MET"],
    [9_999, 10_000, "RESERVE_NOT_MET"],
    [10_000, 10_000, "SOLD"],
    [100, null, "SOLD"],
  ])(
    "ends with the correct result for bid %s and reserve %s",
    async (currentBid, reservePrice, expectedResult) => {
      mocks.findUnique.mockResolvedValue({
        userId: "seller",
        status: "LIVE",
        auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
        currentBid,
        reservePrice,
      });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: {
          id: listingId,
          userId: "seller",
          status: "LIVE",
          auctionEndsAt: { lte: now },
        },
        data: {
          auctionEndsAt: now,
          status: "ENDED",
          result: expectedResult,
        },
      });
      await expect(response.json()).resolves.toEqual({
        message: "Auction ended successfully",
        result: expectedResult,
      });
      expect(mocks.trigger).toHaveBeenCalledWith(
        `listing-${listingId}`,
        "auction-ended",
        { auctionEndsAt: now, result: expectedResult }
      );
    }
  );

  it("reports a competing end request as a conflict", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction has already ended",
    });
  });
});
