import { describe, expect, it } from "vitest";
import { auctionNow, makePublicListing } from "@/app/test/auction-fixtures";
import { auctionPhase } from "./auction-lifecycle";
import { describeAuction } from "./auction-display";

const now = auctionNow.getTime();

function describeAt(overrides: Parameters<typeof makePublicListing>[0], viewerId: string | null) {
  const listing = makePublicListing(overrides);
  return describeAuction(listing, auctionPhase(listing, now), viewerId);
}

describe("describeAuction", () => {
  it.each(["buyer", null])("describes an Upcoming Auction to %s", (viewerId) => {
    expect(describeAt({ status: "UPCOMING", reservePrice: 20000 }, viewerId)).toEqual({
      headline: "Coming soon",
      tone: "upcoming",
      bucket: "upcoming",
      price: { label: "Starting bid", amount: 10000 },
      timer: "none",
      action: "watch",
      message: "Bidding hasn’t opened yet. Add this vehicle to your watchlist to find it again easily.",
      result: null,
      noReserveNote: null,
    });
  });

  it("invites the seller to set up their Upcoming Auction", () => {
    expect(describeAt({ status: "UPCOMING", reservePrice: 20000 }, "seller")).toMatchObject({
      action: "edit-listing",
      message: "Bidding hasn’t opened yet. Set up your auction below when you’re ready.",
    });
  });

  it.each(["buyer", null])("invites %s to bid on an Open Auction accepting bids", (viewerId) => {
    expect(describeAt({ currentBid: 12000, reservePrice: 20000 }, viewerId)).toEqual({
      headline: "Live auction",
      tone: "live",
      bucket: "live",
      price: { label: "Current bid", amount: 12000 },
      timer: "countdown",
      action: "place-bid",
      message: null,
      result: null,
      noReserveNote: null,
    });
  });

  it.each([
    ["missing-schedule", { auctionStartsAt: null }, "Bidding is unavailable until the auction is configured."],
    ["unconfigured", { bidIncrement: null }, "Bidding is unavailable until the auction is configured."],
    ["not-started", { auctionStartsAt: new Date(now + 1000) }, "Bidding unavailable"],
    ["limit-reached", { currentBid: Number.MAX_SAFE_INTEGER, bidIncrement: 1 }, "Bidding unavailable"],
  ] as const)("explains to buyers and visitors why bidding is blocked (%s)", (_reason, overrides, message) => {
    for (const viewerId of ["buyer", null]) expect(describeAt(overrides, viewerId)).toMatchObject({
      headline: "Live auction",
      bucket: "live",
      timer: "countdown",
      action: null,
      message,
    });
  });

  it("tells a buyer a Closing Auction is awaiting its Result", () => {
    expect(describeAt({ currentBid: 12000, auctionEndsAt: auctionNow, reservePrice: 20000 }, "buyer")).toEqual({
      headline: "Closing",
      tone: "live",
      bucket: "live",
      price: { label: "Current bid", amount: 12000 },
      timer: "closing",
      action: null,
      message: "Finalizing results…",
      result: null,
      noReserveNote: null,
    });
  });

  it("lets the seller retry Finalization of their Closing Auction", () => {
    expect(describeAt({ auctionEndsAt: auctionNow }, "seller")).toMatchObject({
      timer: "closing",
      action: "retry-finalization",
      message: "Finalizing results…",
    });
  });

  it.each(["seller", "buyer", null])("describes a Sold Auction with its price to %s", (viewerId) => {
    expect(describeAt({ status: "ENDED", result: "SOLD", currentBid: 25000, highestBidderId: "buyer", reservePrice: 20000 }, viewerId)).toEqual({
      headline: "Sold",
      tone: "sold",
      bucket: "results",
      price: { label: "Sold for", amount: 25000 },
      timer: "none",
      action: null,
      message: null,
      result: "Auction complete",
      noReserveNote: null,
    });
  });

  it.each([
    [{ currentBid: null }, { label: "No bids", amount: null }, "No bids placed"],
    [{ currentBid: 15000 }, { label: "Highest bid", amount: 15000 }, "Reserve not met"],
  ] as const)("describes an Unsold Auction with %j to every viewer", (overrides, price, result) => {
    for (const viewerId of ["seller", "buyer", null]) expect(describeAt({ status: "ENDED", result: "RESERVE_NOT_MET", reservePrice: 20000, ...overrides }, viewerId)).toEqual({
      headline: "Ended",
      tone: "neutral",
      bucket: "results",
      price,
      timer: "none",
      action: null,
      message: null,
      result,
      noReserveNote: null,
    });
  });

  it("holds back the call to action while a live Auction is syncing", () => {
    expect(describeAuction(makePublicListing({ currentBid: 12000, reservePrice: 20000 }), null, "buyer")).toEqual({
      headline: "Live auction",
      tone: "live",
      bucket: "live",
      price: { label: "Current bid", amount: 12000 },
      timer: "countdown",
      action: null,
      message: "Syncing auction…",
      result: null,
      noReserveNote: null,
    });
  });

  it("keeps the seller's bids in reach while their Auction is syncing", () => {
    expect(describeAuction(makePublicListing(), null, "seller")).toMatchObject({
      action: "view-bids",
      message: "Your auction is live. Results are finalized automatically when the timer ends.",
    });
  });

  it.each([
    [{ status: "UPCOMING" }, "No minimum sale price. The highest accepted bid wins."],
    [{}, "No minimum sale price. The highest accepted bid wins."],
    [{ auctionEndsAt: auctionNow }, "No minimum sale price. The highest accepted bid wins."],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000 }, "This auction had no reserve."],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: null }, "This auction had no reserve."],
  ] as const)("explains a no-reserve Auction %j", (overrides, noReserveNote) => {
    expect(describeAt({ reservePrice: null, ...overrides }, "buyer")).toMatchObject({ noReserveNote });
  });

  it("points the seller at the bids on their Open Auction", () => {
    expect(describeAt({ reservePrice: 20000 }, "seller")).toMatchObject({
      price: { label: "Starting bid", amount: 10000 },
      action: "view-bids",
      message: "Your auction is live. Results are finalized automatically when the timer ends.",
    });
  });
});
