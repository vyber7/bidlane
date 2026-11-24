import { describe, expect, it } from "vitest";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import {
  countInventoryTabs,
  filterAndSortAuctions,
  homeSpotlight,
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
      expect(filterAndSortAuctions(listings, { ...defaults, q, status: "LIVE" }, +auctionNow).map((listing) => listing.id))
        .toEqual(q.trim().toLowerCase() === "2020" || q === "test vehicle" ? [live.id, other.id].sort() : [live.id]);
    }
    expect(filterAndSortAuctions(listings, { ...liveDefaults, q: "no match" }, +auctionNow)).toEqual([]);
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
    expect(filterAndSortAuctions(listings, { ...defaults, sort }, +auctionNow).map((listing) => listing.id)).toEqual(expected);
    expect(listings.map((listing) => listing.id)).toEqual(["missing", "new", "old"]);
  });

  it("places live auctions ahead of ended auctions when sorting by ending soon", () => {
    const ended = makeListing({ id: "ended", status: "ENDED", auctionEndsAt: new Date("2026-01-01") });
    const live = makeListing({ id: "live" });
    expect(filterAndSortAuctions([ended, live], { ...defaults, sort: "ending-soon" }, +auctionNow).map((listing) => listing.id))
      .toEqual(["live", "ended"]);
  });

  it.each(["bid-low", "bid-high"] as const)("keeps ended auctions without bids last for %s", (sort) => {
    const noBids = makeListing({ id: "no-bids", status: "ENDED", currentBid: null, startingBid: 0 });
    const sold = makeListing({ id: "sold", status: "ENDED", currentBid: 10000 });
    expect(filterAndSortAuctions([noBids, sold], { ...defaults, sort }, +auctionNow).map((listing) => listing.id))
      .toEqual(["sold", "no-bids"]);
  });

  it("uses a consistent order for tied values and serialized dates", () => {
    const listings = [makeListing({ id: "b" }), makeListing({ id: "a" })];
    const serialized = JSON.parse(JSON.stringify(listings));
    expect(filterAndSortAuctions(serialized, defaults, +auctionNow).map((listing) => listing.id)).toEqual(["a", "b"]);
  });

  it("counts no-reserve inventory across statuses before applying a search", () => {
    const reserved = makeListing({ id: "reserved", reservePrice: 10000 });
    const live = makeListing({ id: "live" });
    const ended = makeListing({ id: "ended", status: "ENDED", make: "BMW" });
    const listings = [reserved, live, ended];
    expect(countInventoryTabs(listings, +auctionNow)).toEqual({ LIVE: 2, NO_RESERVE: 2, UPCOMING: 0, ENDED: 1 });
    expect(filterAndSortAuctions(listings, { ...defaults, q: "BMW" }, +auctionNow)).toEqual([ended]);
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

describe("homepage spotlight", () => {
  const now = +auctionNow;
  const closing = (overrides = {}) => makeListing({ auctionEndsAt: auctionNow, ...overrides });

  it("features an Auction accepting bids, then other Live, then Upcoming, then Results", () => {
    const accepting = makeListing({ id: "accepting", coverImage: "a.jpg" });
    const closingCar = closing({ id: "closing", coverImage: "c.jpg", isFeatured: true });
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", coverImage: "u.jpg", isFeatured: true });
    const ended = makeListing({ id: "ended", status: "ENDED", coverImage: "e.jpg", isFeatured: true });
    expect(homeSpotlight([ended, upcoming, closingCar, accepting], now).featured).toBe(accepting);
    expect(homeSpotlight([ended, upcoming, closingCar], now).featured).toBe(closingCar);
    expect(homeSpotlight([ended, upcoming], now).featured).toBe(upcoming);
    expect(homeSpotlight([ended], now).featured).toBe(ended);
    expect(homeSpotlight([], now).featured).toBeNull();
  });

  it("keeps a Live Auction that is not yet accepting bids ahead of Upcoming", () => {
    const notStarted = makeListing({ id: "not-started", auctionStartsAt: new Date(now + 1000) });
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", isFeatured: true });
    expect(homeSpotlight([upcoming, notStarted], now).featured).toBe(notStarted);
  });

  it("honors featured selections and otherwise favors vehicles with photography without mutating inventory", () => {
    const plain = makeListing({ id: "plain", status: "UPCOMING" });
    const photo = makeListing({ id: "photo", status: "UPCOMING", images: ["vehicle.jpg"] });
    const featured = makeListing({ id: "featured", status: "UPCOMING", isFeatured: true, coverImage: "featured.jpg" });
    const inventory = [plain, photo, featured];
    expect(homeSpotlight(inventory, now).featured).toBe(featured);
    expect(homeSpotlight([plain, photo], now).featured).toBe(photo);
    expect(inventory).toEqual([plain, photo, featured]);
  });

  it("uses a photographed result rather than a large placeholder for an upcoming car, and offers the car as coming next", () => {
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", isFeatured: true });
    const result = makeListing({ id: "result", status: "ENDED", coverImage: "result.jpg" });
    expect(homeSpotlight([upcoming, result], now)).toMatchObject({ featured: result, comingNext: upcoming });
  });

  it("does not repeat a featured Upcoming car as coming next", () => {
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING", coverImage: "u.jpg" });
    expect(homeSpotlight([upcoming], now)).toMatchObject({ featured: upcoming, comingNext: null });
  });

  it("falls back to the most recent result", () => {
    const old = makeListing({ id: "old", status: "ENDED", createdAt: new Date(now - 1000) });
    const recent = makeListing({ id: "recent", status: "ENDED" });
    expect(homeSpotlight([old, recent], now).featured).toBe(recent);
  });

  it("counts a Closing Auction as Live and points the hero at it", () => {
    const upcoming = makeListing({ id: "upcoming", status: "UPCOMING" });
    expect(homeSpotlight([closing({ id: "closing" }), upcoming], now)).toMatchObject({
      counts: { LIVE: 1, NO_RESERVE: 2, UPCOMING: 1, ENDED: 0 },
      browse: "LIVE",
    });
  });

  it.each([
    [[makeListing({ status: "UPCOMING" }), makeListing({ status: "ENDED" })], "UPCOMING"],
    [[makeListing({ status: "ENDED" })], "ENDED"],
    [[], null],
  ] as const)("points the hero at the first tab with Auctions (%#)", (listings, browse) => {
    expect(homeSpotlight([...listings], now).browse).toBe(browse);
  });
});

describe("ending soon", () => {
  it("orders Open Auctions by deadline, then Closing Auctions, then the rest", () => {
    const now = +auctionNow;
    const later = makeListing({ id: "later", auctionEndsAt: new Date(now + 120000) });
    const sooner = makeListing({ id: "sooner", auctionEndsAt: new Date(now + 60000) });
    const closingCar = makeListing({ id: "closing", auctionEndsAt: new Date(now - 1000), createdAt: new Date(now) });
    const ended = makeListing({ id: "ended", status: "ENDED", auctionEndsAt: new Date(now - 5000), createdAt: new Date(now - 1) });
    expect(filterAndSortAuctions([ended, closingCar, later, sooner], { q: "", status: "NO_RESERVE", sort: "ending-soon" }, now)
      .map((listing) => listing.id)).toEqual(["sooner", "later", "closing", "ended"]);
  });
});
