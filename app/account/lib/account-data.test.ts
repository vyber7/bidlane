import { describe, expect, it } from "vitest";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import { buildBidSummaries, type BidWithListing } from "./bids";
import { buildAccountNotifications } from "./notifications";
import { buildShipments } from "./shipments";

function bid(listing = makeListing(), overrides: Partial<BidWithListing> = {}): BidWithListing {
  return {
    id: "bid-1", listingId: listing.id, listing, userId: "buyer",
    amount: 12000, createdAt: auctionNow, ...overrides,
  };
}

const notifications = (overrides: Partial<Parameters<typeof buildAccountNotifications>[0]> = {}) =>
  buildAccountNotifications({ bids: [], watchedListings: [], sellerListings: [], userId: "buyer", ...overrides });

describe("account bid summaries", () => {
  it("groups bids by listing, preserving the highest amount, latest activity, and row order", () => {
    const latest = bid(makeListing({ highestBidderId: "buyer", currentBid: 15000 }));
    const other = bid(makeListing({ id: "other", auctionEndsAt: null }));
    const older = bid(latest.listing, { id: "older", amount: 15000, createdAt: new Date("2026-10-13T12:00:00Z") });
    const input = Object.freeze([latest, other, older]);
    const before = structuredClone(input);

    expect(buildBidSummaries(input, "buyer")).toEqual([
      {
        id: latest.listingId, year: 2020, make: "Porsche", model: "911", location: "New York",
        coverImage: null, status: "LIVE", result: null, currentBid: 15000,
        auctionEndsAt: latest.listing.auctionEndsAt!.toISOString(),
        highestBid: 15000, lastBidAt: auctionNow.toISOString(), bidCount: 2, isHighestBidder: true,
      },
      expect.objectContaining({ id: "other", auctionEndsAt: null, bidCount: 1, isHighestBidder: false }),
    ]);
    expect(input).toEqual(before);
  });
});

describe("account notifications", () => {
  it.each([
    ["LIVE", null, "buyer", "leading-12500", "You’re the highest bidder", "success", "View auction"],
    ["LIVE", null, "other", "outbid-12500", "You’ve been outbid", "warning", "Bid again"],
    ["ENDED", "SOLD", "buyer", "ended-won", "You won the auction", "success", "View your win"],
    ["ENDED", "SOLD", "other", "ended-closed", "Auction ended", "neutral", "View result"],
    ["ENDED", "RESERVE_NOT_MET", "buyer", "ended-closed", "Auction ended", "neutral", "View result"],
  ])("preserves IDs and actions for %s / %s / %s", (status, result, highestBidderId, suffix, title, tone, actionLabel) => {
    const listing = makeListing({ status, result, highestBidderId, currentBid: 12500 });
    const items = notifications({ bids: [bid(listing), bid(listing, { id: "older" })] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `bid-${listing.id}-${suffix}`, title, tone, actionLabel, href: `/listing/${listing.id}` });
    expect(items[0].createdAt).toBe((status === "LIVE" ? listing.updatedAt! : listing.auctionEndsAt!).toISOString());
    expect(items[0].message).toContain("2020 Porsche 911");
  });

  it("avoids duplicate watch alerts and ignores auctions that are not live", () => {
    const listing = makeListing();
    const watched = makeListing({ id: "watched", auctionStartsAt: null, updatedAt: null });
    const items = notifications({
      bids: [bid(listing)],
      watchedListings: [listing, watched, makeListing({ id: "upcoming", status: "UPCOMING" }), makeListing({ id: "ended", status: "ENDED" })],
    });

    expect(items.map((item) => item.id)).toEqual([`bid-${listing.id}-outbid-0`, "watch-watched-live"]);
    expect(items[1].createdAt).toBe(watched.createdAt.toISOString());
    expect(notifications({ bids: [bid(makeListing({ status: "UPCOMING" }))] })).toEqual([]);
  });

  it("uses the latest bid's time when listing dates are missing", () => {
    const latest = bid(makeListing({ updatedAt: null, auctionEndsAt: null }));
    const older = bid(latest.listing, { createdAt: new Date("2026-10-13T12:00:00Z") });
    expect(notifications({ bids: [latest, older] })[0].createdAt).toBe(auctionNow.toISOString());
    expect(notifications({ bids: [bid({ ...latest.listing, status: "ENDED" })] })[0].createdAt).toBe(auctionNow.toISOString());
  });

  it("formats seller comments and outcomes and sorts everything newest first without mutating inputs", () => {
    const comments = [
      { id: "long", body: "a".repeat(101), image: null, createdAt: new Date("2026-10-15T12:00:00Z"), listingId: "sold", userId: "buyer", user: { name: "Alex" } },
      { id: "image-only", body: null, image: "photo", createdAt: new Date("2026-10-13T12:00:00Z"), listingId: "sold", userId: null, user: null },
    ];
    const sellerListings = [
      { ...makeListing({ id: "sold", status: "ENDED", result: "SOLD" }), comments },
      { ...makeListing({ id: "unsold", status: "ENDED", result: null, auctionEndsAt: null, updatedAt: null }), comments: [] },
    ];
    const before = structuredClone(sellerListings);
    const items = notifications({ sellerListings });

    expect(items.map((item) => item.id)).toEqual(["comment-long", "seller-sold-ended-SOLD", "seller-unsold-ended-ended", "comment-image-only"]);
    expect(items[0]).toMatchObject({ message: `Alex commented on your 2020 Porsche 911: “${"a".repeat(100)}…”`, href: "/listing/sold#comments" });
    expect(items[1]).toMatchObject({ title: "Your vehicle sold", tone: "success" });
    expect(items[2]).toMatchObject({ title: "Your auction ended", tone: "neutral", createdAt: auctionNow.toISOString() });
    expect(items[3].message).toBe("A buyer commented on your 2020 Porsche 911.");
    expect(sellerListings).toEqual(before);
  });
});

describe("account shipments", () => {
  const sold = () => ({
    ...makeListing({ status: "ENDED", result: "SOLD", currentBid: 15000, highestBidderId: "buyer" }),
    user: { name: "Sam Seller", email: "seller@example.com" },
    highestBidder: { name: "Bob Buyer", email: "buyer@example.com" },
  });

  it.each([
    ["seller", "seller", "Bob", "buyer@example.com"],
    ["buyer", "buyer", "Sam", "seller@example.com"],
  ])("selects the counterparty for %s", (userId, role, contactName, contactEmail) => {
    const listing = sold();
    const before = structuredClone(listing);
    expect(buildShipments(Object.freeze([listing]), userId)).toEqual([
      expect.objectContaining({ role, contactName, contactEmail, price: 15000, soldAt: listing.auctionEndsAt!.toISOString() }),
    ]);
    expect(listing).toEqual(before);
  });

  it("preserves zero prices and falls back for missing sale dates, prices, and contacts", () => {
    const listing = { ...sold(), currentBid: null, auctionEndsAt: null, highestBidder: null };
    expect(buildShipments([listing], "seller")[0]).toMatchObject({ price: 10000, soldAt: auctionNow.toISOString(), contactName: "the buyer", contactEmail: null });
    expect(buildShipments([{ ...listing, currentBid: 0 }], "seller")[0].price).toBe(0);
    expect(buildShipments([{ ...listing, startingBid: null, updatedAt: null, user: { name: null, email: null } }], "buyer")[0]).toMatchObject({ price: 0, soldAt: auctionNow.toISOString(), contactName: "the seller", contactEmail: null });
  });
});

it("returns empty account data for empty query results", () => {
  expect(buildBidSummaries([], "buyer")).toEqual([]);
  expect(notifications()).toEqual([]);
  expect(buildShipments([], "buyer")).toEqual([]);
});
