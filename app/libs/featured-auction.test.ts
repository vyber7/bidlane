import { describe, expect, it } from "vitest";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import { getHomeSpotlight, selectFeaturedAuction } from "./featured-auction";

describe("homepage featured vehicle", () => {
  it("prioritizes active auctions over featured upcoming cars and results", () => {
    const live = makeListing({ id: "live", coverImage: "car.jpg" });
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", isFeatured: true });
    const ended = makeListing({ id: "ended", status: "ENDED", isFeatured: true });
    expect(selectFeaturedAuction([ended, upcoming, live], +auctionNow)).toBe(live);
  });

  it("highlights upcoming cars when live auctions have expired or have no deadline", () => {
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING" });
    expect(selectFeaturedAuction([
      makeListing({ auctionEndsAt: auctionNow }),
      makeListing({ auctionEndsAt: null }),
      makeListing({ status: "ENDED" }),
      upcoming,
    ], +auctionNow)).toBe(upcoming);
  });

  it("honors featured selections and otherwise favors vehicles with photography without mutating inventory", () => {
    const plain = makeListing({ id: "plain", status: "UPCOMING" });
    const photo = makeListing({ id: "photo", status: "UPCOMING", images: ["vehicle.jpg"] });
    const featured = makeListing({ id: "featured", status: "UPCOMING", isFeatured: true, coverImage: "featured.jpg" });
    const inventory = [plain, photo, featured];
    expect(selectFeaturedAuction(inventory, +auctionNow)).toBe(featured);
    expect(selectFeaturedAuction([plain, photo], +auctionNow)).toBe(photo);
    expect(inventory).toEqual([plain, photo, featured]);
  });

  it("uses a photographed result rather than a large placeholder for an upcoming car", () => {
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", isFeatured: true });
    const result = makeListing({ id: "result", status: "ENDED", coverImage: "result.jpg" });
    expect(selectFeaturedAuction([upcoming, result], +auctionNow)).toBe(result);
    expect(getHomeSpotlight([upcoming, result], +auctionNow)).toEqual({ featured: result, live: false, upcoming });
  });

  it("falls back to recent results and handles an empty or expired-only inventory", () => {
    const old = makeListing({ id: "old", status: "ENDED", createdAt: new Date(+auctionNow - 1000) });
    const recent = makeListing({ id: "recent", status: "ENDED" });
    expect(selectFeaturedAuction([old, recent], +auctionNow)).toBe(recent);
    expect(selectFeaturedAuction([], +auctionNow)).toBeNull();
    expect(selectFeaturedAuction([makeListing({ auctionEndsAt: auctionNow })], +auctionNow)).toBeNull();
  });
});
