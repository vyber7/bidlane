import { describe, expect, it } from "vitest";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import { buildBidSummaries, type BidWithListing } from "./bids";
import { buildShipments } from "./shipments";

function bid(listing = makeListing(), overrides: Partial<BidWithListing> = {}): BidWithListing {
  return {
    id: "bid-1", listingId: listing.id, listing, userId: "buyer",
    amount: 12000, createdAt: auctionNow, ...overrides,
  };
}

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
        coverImage: null, status: "LIVE", result: null, group: "live", currentBid: 15000,
        auctionEndsAt: latest.listing.auctionEndsAt!.toISOString(),
        highestBid: 15000, lastBidAt: auctionNow.toISOString(), bidCount: 2, isHighestBidder: true, completionHref: null,
        auction: expect.objectContaining({ id: latest.listingId, status: "LIVE", currentBid: 15000, isWatching: false }),
      },
      expect.objectContaining({ id: "other", auctionEndsAt: null, bidCount: 1, isHighestBidder: false }),
    ]);
    expect(input).toEqual(before);
  });

  it.each([
    [{ status: "UPCOMING" }, "upcoming"],
    [{ auctionEndsAt: auctionNow }, "live"],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 9000 }, "results"],
  ] as const)("files an Auction with %j under %s, keeping a Closing Auction with Active Bids", (overrides, group) => {
    expect(buildBidSummaries([bid(makeListing(overrides))], "buyer", auctionNow.getTime())[0].group).toBe(group);
  });

  it("adds a completion destination only for a distinct winning buyer", () => {
    const listing = makeListing({ status: "ENDED", result: "SOLD", highestBidderId: "buyer" });
    expect(buildBidSummaries([bid(listing)], "buyer")[0].completionHref).toBe(`/account/shipments#transaction-${listing.id}`);
    expect(buildBidSummaries([bid(listing)], "seller")[0].completionHref).toBeNull();
    expect(buildBidSummaries([bid({ ...listing, userId: "buyer" })], "buyer")[0].completionHref).toBeNull();
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

  it("restores shared confirmations for both parties and handles sales without a buyer", () => {
    const listing = { ...sold(), paymentBuyerConfirmedAt: auctionNow, paymentSellerConfirmedAt: auctionNow };
    for (const userId of ["buyer", "seller"]) {
      expect(buildShipments([listing], userId)[0].completion).toEqual({
        payment: { buyer: auctionNow.toISOString(), seller: auctionNow.toISOString() },
        paperwork: { buyer: null, seller: null }, pickup: { buyer: null, seller: null },
      });
    }
    expect(buildShipments([{ ...listing, highestBidderId: null }], "seller")[0].completion).toBeNull();
  });

  it.each([null, "seller"])("keeps a legacy sale in seller history without a counterparty or checklist (%s)", (highestBidderId) => {
    const listing = { ...sold(), highestBidderId, highestBidder: sold().user };
    expect(buildShipments([listing], "seller")).toEqual([
      expect.objectContaining({ role: "seller", contactEmail: null, completion: null }),
    ]);
    expect(buildShipments([listing], "buyer")).toEqual([]);
  });

  it("omits unrelated sales and reserve-missed auctions from account history", () => {
    const listing = sold();
    expect(buildShipments([listing], "stranger")).toEqual([]);
    expect(buildShipments([{ ...listing, result: "RESERVE_NOT_MET" }], "seller")).toEqual([]);
  });
});

it("returns empty account data for empty query results", () => {
  expect(buildBidSummaries([], "buyer")).toEqual([]);
  expect(buildShipments([], "buyer")).toEqual([]);
});
