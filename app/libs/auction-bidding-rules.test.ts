import { describe, expect, it } from "vitest";
import { MAX_INTEGER } from "@/app/schemas/common";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import { auctionBiddingState } from "./auction-bidding-rules";

describe("auction bidding rules", () => {
  const now = auctionNow.getTime();

  it("waits for a clock reading", () => {
    expect(auctionBiddingState(makeListing(), null)).toEqual({ state: "syncing" });
  });

  it.each([
    { status: "UPCOMING" },
    { status: "ENDED" },
    { auctionStartsAt: new Date(now + 1) },
    { auctionEndsAt: auctionNow },
  ] as const)("keeps bidding closed for %j", (overrides) => {
    expect(auctionBiddingState(makeListing(overrides), now)).toEqual({ state: "closed" });
  });

  it.each([
    { auctionStartsAt: null },
    { auctionEndsAt: null },
    { auctionEndsAt: new Date(NaN) },
  ])("requires a valid schedule for %j", (overrides) => {
    expect(auctionBiddingState(makeListing(overrides), now)).toEqual({ state: "missing-schedule" });
  });

  it.each([{ startingBid: null }, { bidIncrement: null }])("requires bid configuration for %j", (overrides) => {
    expect(auctionBiddingState(makeListing(overrides), now)).toEqual({ state: "unconfigured" });
  });

  it("opens at the start time and preserves a zero starting bid", () => {
    const listing = makeListing({ auctionStartsAt: auctionNow, startingBid: 0 });
    expect(auctionBiddingState(listing, now)).toEqual({
      state: "open", minimumBid: 0, endsAt: listing.auctionEndsAt,
    });
  });

  it("uses the current bid plus the increment up to the bid limit", () => {
    const listing = makeListing({ currentBid: MAX_INTEGER - 1, bidIncrement: 1 });
    expect(auctionBiddingState(listing, now)).toEqual({
      state: "open", minimumBid: MAX_INTEGER, endsAt: listing.auctionEndsAt,
    });
    expect(auctionBiddingState({ ...listing, currentBid: MAX_INTEGER }, now)).toEqual({ state: "limit-reached" });
  });
});
