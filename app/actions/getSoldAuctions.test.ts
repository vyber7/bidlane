import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/app/libs/prismadb", () => ({
  default: { listing: { findMany: mocks.findMany } },
}));
vi.mock("@/app/libs/logger", () => ({ logger: mocks.logger }));

import getSoldAuctions from "./getSoldAuctions";

describe("getSoldAuctions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the four most recently ended sold auctions", async () => {
    mocks.findMany.mockResolvedValue([{ id: "sold-listing" }]);

    await expect(getSoldAuctions()).resolves.toEqual([{ id: "sold-listing" }]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: "ENDED",
        result: "SOLD",
        currentBid: { not: null },
      },
      orderBy: { auctionEndsAt: "desc" },
      take: 4,
    });
  });

  it("returns an empty list when sold auctions cannot be loaded", async () => {
    const error = new Error("database unavailable");
    mocks.findMany.mockRejectedValue(error);

    await expect(getSoldAuctions()).resolves.toEqual([]);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "auctions.sold_fetch_failed",
      error
    );
  });
});
