import { describe, expect, it } from "vitest";
import { makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import { filterAndSortAuctions, readAuctionFilters, updateAuctionParams, type AuctionSort } from "./auction-filters";

const defaults = { q: "", status: "ALL", sort: "newest" } as const;

describe("auction URL filters", () => {
  it("reads shared links and safely falls back for unsupported values", () => {
    expect(readAuctionFilters(new URLSearchParams("status=live&q=911+%26+Carrera&sort=bid-high")))
      .toEqual({ q: "911 & Carrera", status: "LIVE", sort: "bid-high" });
    expect(readAuctionFilters(new URLSearchParams("status=unknown&sort=constructor"))).toEqual(defaults);
    expect(readAuctionFilters(new URLSearchParams())).toEqual(defaults);
  });

  it("combines filters without dropping unrelated params and removes defaults", () => {
    const original = new URLSearchParams("utm_source=share&status=live&sort=bid-high&q=Porsche");
    const updated = updateAuctionParams(original, { status: "ALL", sort: "newest", q: "" });
    expect(updated.toString()).toBe("utm_source=share");
    expect(original.get("q")).toBe("Porsche");
    expect(updateAuctionParams(updated, { status: "UPCOMING", q: "BMW & MINI" }).get("q")).toBe("BMW & MINI");
  });

  it("combines status and case-insensitive search across vehicle details", () => {
    const live = makeListing({ id: "live", location: "Boston" });
    const ended = makeListing({ id: "ended", status: "ENDED", location: "Boston" });
    const other = makeListing({ id: "other", make: "BMW", model: "M3", location: "Miami" });
    const listings = [live, ended, other];
    for (const q of [" PORSCHE ", "911", "2020", "bOsToN", "test vehicle"]) {
      expect(filterAndSortAuctions(listings, { ...defaults, q, status: "LIVE" }).map((listing) => listing.id))
        .toEqual(q.trim().toLowerCase() === "2020" || q === "test vehicle" ? [live.id, other.id].sort() : [live.id]);
    }
    expect(filterAndSortAuctions(listings, { ...defaults, q: "no match" })).toEqual([]);
  });

  it.each<[AuctionSort, string[]]>([
    ["newest", ["new", "old", "missing"]],
    ["ending-soon", ["old", "new", "missing"]],
    ["bid-low", ["old", "new", "missing"]],
    ["bid-high", ["new", "old", "missing"]],
    ["mileage-low", ["old", "new", "missing"]],
  ])("sorts by %s without mutating the source or inventing missing values", (sort, expected) => {
    const listings = [
      makeListing({ id: "missing", status: "UPCOMING", startingBid: null, currentBid: null, auctionEndsAt: null, createdAt: new Date("2026-01-01"), miles: 30000 }),
      makeListing({ id: "new", currentBid: 15000, createdAt: new Date("2026-03-01"), auctionEndsAt: new Date("2026-10-22"), miles: 20000 }),
      makeListing({ id: "old", currentBid: null, startingBid: 0, createdAt: new Date("2026-02-01"), auctionEndsAt: new Date("2026-10-21"), miles: 10000 }),
    ];
    expect(filterAndSortAuctions(listings, { ...defaults, sort }).map((listing) => listing.id)).toEqual(expected);
    expect(listings.map((listing) => listing.id)).toEqual(["missing", "new", "old"]);
  });

  it("places live auctions ahead of ended auctions when sorting by ending soon", () => {
    const ended = makeListing({ id: "ended", status: "ENDED", auctionEndsAt: new Date("2026-01-01") });
    const live = makeListing({ id: "live" });
    expect(filterAndSortAuctions([ended, live], { ...defaults, sort: "ending-soon" }).map((listing) => listing.id))
      .toEqual(["live", "ended"]);
  });

  it.each(["bid-low", "bid-high"] as const)("keeps ended auctions without bids last for %s", (sort) => {
    const noBids = makeListing({ id: "no-bids", status: "ENDED", currentBid: null, startingBid: 0 });
    const sold = makeListing({ id: "sold", status: "ENDED", currentBid: 10000 });
    expect(filterAndSortAuctions([noBids, sold], { ...defaults, sort }).map((listing) => listing.id))
      .toEqual(["sold", "no-bids"]);
  });

  it("uses a consistent order for tied values and serialized dates", () => {
    const listings = [makeListing({ id: "b" }), makeListing({ id: "a" })];
    const serialized = JSON.parse(JSON.stringify(listings));
    expect(filterAndSortAuctions(serialized, defaults).map((listing) => listing.id)).toEqual(["a", "b"]);
  });
});
