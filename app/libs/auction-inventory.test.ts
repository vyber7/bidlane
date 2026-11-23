import { describe, expect, it } from "vitest";
import { makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import {
  countInventoryTabs,
  filterAndSortAuctions,
  inventoryHref,
  inventoryPage,
  readAuctionInventory,
  updateInventoryParams,
  type AuctionSort,
} from "./auction-inventory";

const liveDefaults = { q: "", status: "LIVE", sort: "newest", page: 1 } as const;
const defaults = { q: "", status: "NO_RESERVE", sort: "newest" } as const;

describe("auction URL filters", () => {
  it("reads shared links and safely falls back for unsupported values", () => {
    expect(readAuctionInventory(new URLSearchParams("status=live&q=911+%26+Carrera&sort=bid-high&page=2")))
      .toEqual({ q: "911 & Carrera", status: "LIVE", sort: "bid-high", page: 2 });
    expect(readAuctionInventory(new URLSearchParams("status=unknown&sort=constructor&page=-2"))).toEqual(liveDefaults);
    expect(readAuctionInventory(new URLSearchParams())).toEqual(liveDefaults);
  });

  it("resets the page only when a filter changes and preserves unrelated params", () => {
    const original = new URLSearchParams("utm_source=share&status=live&sort=bid-high&q=Porsche&page=3");
    expect(updateInventoryParams(original, { q: "Porsche" }).toString()).toBe(original.toString());
    const updated = updateInventoryParams(original, { sort: "newest", q: "" });
    expect(updated.toString()).toBe("utm_source=share&status=live");
    expect(original.get("q")).toBe("Porsche");
    expect(updateInventoryParams(updated, { status: "UPCOMING", q: "BMW & MINI" }).get("q")).toBe("BMW & MINI");
    expect(updateInventoryParams(original, { page: 1 }).get("page")).toBeNull();
    expect(updateInventoryParams(original, { page: 2 }).get("sort")).toBe("bid-high");
  });

  it("builds inventory links that resolve to the same tab", () => {
    const url = new URL(inventoryHref("NO_RESERVE"), "https://bidlane.invalid");
    expect(url.hash).toBe("#auctions");
    expect(readAuctionInventory(url.searchParams).status).toBe("NO_RESERVE");
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
    expect(filterAndSortAuctions(listings, { ...liveDefaults, q: "no match" })).toEqual([]);
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

  it("counts no-reserve inventory across statuses before applying a search", () => {
    const reserved = makeListing({ id: "reserved", reservePrice: 10000 });
    const live = makeListing({ id: "live" });
    const ended = makeListing({ id: "ended", status: "ENDED", make: "BMW" });
    const listings = [reserved, live, ended];
    expect(countInventoryTabs(listings)).toEqual({ LIVE: 2, NO_RESERVE: 2, UPCOMING: 0, ENDED: 1 });
    expect(filterAndSortAuctions(listings, { ...defaults, q: "BMW" })).toEqual([ended]);
  });

  it("clamps a shared page to the available results", () => {
    const listings = Array.from({ length: 25 }, (_, index) => makeListing({ id: String(index) }));
    expect(inventoryPage(listings, 99)).toEqual({
      listings: [listings[24]], page: 2, pageCount: 2, previousPage: 1, nextPage: null,
    });
    expect(inventoryPage([], 99)).toEqual({
      listings: [], page: 1, pageCount: 0, previousPage: null, nextPage: null,
    });
  });
});
