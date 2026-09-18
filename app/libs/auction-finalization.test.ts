import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  trigger: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import {
  determineAuctionResult,
  finalizeAuction,
  finalizeExpiredAuctions,
} from "./auction-finalization";

const listingId = "abcdef0123456789abcdef01";
const endTime = new Date("2026-09-10T11:59:00.000Z");
const now = new Date("2026-09-10T12:00:00.000Z");

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    status: "LIVE",
    result: null,
    auctionEndsAt: endTime,
    currentBid: 12_000,
    reservePrice: 10_000,
    ...overrides,
  };
}

describe("determineAuctionResult", () => {
  it.each([
    [null, 10_000, "RESERVE_NOT_MET"],
    [9_999, 10_000, "RESERVE_NOT_MET"],
    [10_000, 10_000, "SOLD"],
    [100, null, "SOLD"],
  ])("maps bid %s and reserve %s to %s", (bid, reserve, expected) => {
    expect(determineAuctionResult(bid, reserve)).toBe(expected);
  });
});

describe("finalizeAuction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(listing());
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("returns not_found without trying to update", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(finalizeAuction(listingId, now)).resolves.toEqual({
      status: "not_found",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not finalize before the current deadline", async () => {
    const futureEnd = new Date("2026-09-10T12:01:00.000Z");
    mocks.findUnique.mockResolvedValue(listing({ auctionEndsAt: futureEnd }));

    await expect(finalizeAuction(listingId, now)).resolves.toEqual({
      status: "not_due",
      auctionEndsAt: futureEnd,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("treats an ended auction as an idempotent no-op", async () => {
    mocks.findUnique.mockResolvedValue(
      listing({ status: "ENDED", result: "SOLD" })
    );

    await expect(finalizeAuction(listingId, now)).resolves.toEqual({
      status: "already_finalized",
      result: "SOLD",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("atomically finalizes a sold auction without changing its deadline", async () => {
    await expect(finalizeAuction(listingId, now)).resolves.toEqual({
      status: "finalized",
      result: "SOLD",
      auctionEndsAt: endTime,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: listingId,
        status: "LIVE",
        auctionEndsAt: endTime,
      },
      data: { status: "ENDED", result: "SOLD" },
    });
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "auction-ended",
      { auctionEndsAt: endTime, result: "SOLD" }
    );
  });

  it("records reserve-not-met when there are no bids", async () => {
    mocks.findUnique.mockResolvedValue(listing({ currentBid: null }));

    const result = await finalizeAuction(listingId, now);

    expect(result).toMatchObject({
      status: "finalized",
      result: "RESERVE_NOT_MET",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "ENDED", result: "RESERVE_NOT_MET" },
      })
    );
  });

  it("lets a competing last-second extension win", async () => {
    const extendedEnd = new Date("2026-09-10T12:02:00.000Z");
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce({
        status: "LIVE",
        result: null,
        auctionEndsAt: extendedEnd,
      });

    await expect(finalizeAuction(listingId, now)).resolves.toEqual({
      status: "not_due",
      auctionEndsAt: extendedEnd,
    });
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("retries once when a lost claim is still eligible", async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.findUnique
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce(listing());

    await expect(finalizeAuction(listingId, now)).resolves.toMatchObject({
      status: "finalized",
      result: "SOLD",
    });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.trigger).toHaveBeenCalledTimes(1);
  });

  it("does not fail a committed finalization when notification fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("Pusher unavailable"));

    await expect(finalizeAuction(listingId, now)).resolves.toMatchObject({
      status: "finalized",
      result: "SOLD",
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "auction.end_notification_failed",
      { listingId }
    );
  });
});

describe("finalizeExpiredAuctions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("finalizes due auctions and reports a bounded batch summary", async () => {
    mocks.findMany.mockResolvedValue([
      listing(),
      listing({ id: "abcdef0123456789abcdef02", currentBid: null }),
    ]);
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(finalizeExpiredAuctions(now, 250)).resolves.toEqual({
      checked: 2,
      finalized: 2,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { status: "LIVE", auctionEndsAt: { lte: now } },
      orderBy: { auctionEndsAt: "asc" },
      take: 100,
      select: expect.any(Object),
    });
  });

  it("isolates a failed auction so the rest of the batch can finish", async () => {
    mocks.findMany.mockResolvedValue([
      listing(),
      listing({ id: "abcdef0123456789abcdef02" }),
    ]);
    mocks.updateMany
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ count: 1 });

    await expect(finalizeExpiredAuctions(now, 10)).resolves.toEqual({
      checked: 2,
      finalized: 1,
      skipped: 0,
      failed: 1,
      hasMore: false,
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "auction.scheduled_finalization_failed",
      expect.any(Error),
      { listingId }
    );
  });
});
