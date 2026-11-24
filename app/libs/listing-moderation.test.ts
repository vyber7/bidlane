import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), auction: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("./read-repositories", () => ({ getReadRepositories: () => { throw new Error("Unexpected overview query"); } }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ listingAuthoring: { reviewQueue: mocks.findMany, reviewDetail: mocks.findUnique }, auctions: { find: mocks.auction } }) }));
import { getListingReview, getReviewQueue } from "./listing-moderation";

beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" }); mocks.findMany.mockResolvedValue([]); mocks.findUnique.mockResolvedValue(null); mocks.auction.mockResolvedValue(null); });

describe("admin listing review data", () => {
  it.each([null, { id: "user", role: "USER" }])("protects queue and history reads for %j", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(getReviewQueue()).rejects.toHaveProperty("status", user ? 403 : 401);
    await expect(getListingReview("id")).rejects.toHaveProperty("status", user ? 403 : 401);
    expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("includes legacy upcoming listings in the pending queue and paginates oldest first", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 21 }, (_, id) => ({ id })));
    const result = await getReviewQueue(2);
    expect(result.hasMore).toBe(true); expect(result.listings).toHaveLength(20);
    expect(mocks.findMany).toHaveBeenCalledWith(2, "PENDING");
  });
  it("lets admins revisit approved listings to request changes", async () => {
    await getReviewQueue(1, "APPROVED");
    expect(mocks.findMany).toHaveBeenCalledWith(1, "APPROVED");
  });
  it("loads review history with seller contact only after admin authorization", async () => {
    mocks.findUnique.mockResolvedValue({ id: "listing", reviews: [] });
    mocks.auction.mockResolvedValue({ status: "UPCOMING", result: null, auctionStartsAt: null, auctionEndsAt: null, startingBid: null, currentBid: null, bidIncrement: null, highestBidderId: null });
    expect(await getListingReview("listing")).toHaveProperty("id", "listing");
    expect(mocks.findUnique).toHaveBeenCalledWith("listing");
  });
  it.each([
    [{ status: "UPCOMING" }, "upcoming"],
    [{ status: "LIVE", auctionStartsAt: new Date(Date.now() - 60_000), auctionEndsAt: new Date(Date.now() + 60_000) }, "open"],
    [{ status: "LIVE", auctionStartsAt: new Date(Date.now() - 60_000), auctionEndsAt: new Date(Date.now() - 1_000) }, "closing"],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000 }, "sold"],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: null }, "unsold"],
  ])("reports the Auction phase for %j", async (auction, phase) => {
    mocks.findUnique.mockResolvedValue({ id: "listing", reviews: [] });
    mocks.auction.mockResolvedValue({
      result: null, auctionStartsAt: null, auctionEndsAt: null, startingBid: 10000, currentBid: null, bidIncrement: 500, highestBidderId: null,
      ...auction,
    });
    expect(await getListingReview("listing")).toHaveProperty("phase", phase);
  });
});
