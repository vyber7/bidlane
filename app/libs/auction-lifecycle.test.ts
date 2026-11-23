import { describe, expect, it } from "vitest";
import { MAX_INTEGER } from "@/app/schemas/common";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import {
  auctionPhase,
  auctionPrice,
  EXTENSION_WINDOW_MS,
  extendedDeadline,
  isDue,
  phaseLabel,
  settle,
} from "./auction-lifecycle";

const now = auctionNow.getTime();

describe("auctionPhase", () => {
  it.each([
    [{ status: "UPCOMING" }, { phase: "upcoming" }],
    [{ auctionEndsAt: auctionNow }, { phase: "closing" }],
    [{ auctionEndsAt: new Date(now - 1), auctionStartsAt: null }, { phase: "closing" }],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000, highestBidderId: "buyer" }, { phase: "sold", price: 12000, buyerId: "buyer" }],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 9000 }, { phase: "unsold", reason: "reserve-not-met", highestBid: 9000 }],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: null }, { phase: "unsold", reason: "no-bids", highestBid: null }],
  ] as const)("%j is %j", (overrides, expected) => {
    expect(auctionPhase(makeListing(overrides), now)).toEqual(expected);
  });

  it.each([
    [{ auctionStartsAt: null }, "missing-schedule"],
    [{ auctionEndsAt: null }, "missing-schedule"],
    [{ auctionEndsAt: new Date(NaN) }, "missing-schedule"],
    [{ auctionStartsAt: new Date(now + 1) }, "not-started"],
    [{ startingBid: null }, "unconfigured"],
    [{ bidIncrement: null }, "unconfigured"],
    [{ currentBid: MAX_INTEGER, bidIncrement: 1 }, "limit-reached"],
  ] as const)("blocks bidding on an open auction with %j", (overrides, reason) => {
    expect(auctionPhase(makeListing(overrides), now)).toEqual({ phase: "open", bidding: { accepting: false, reason } });
  });

  it("opens at the start time and preserves a zero starting bid", () => {
    const listing = makeListing({ auctionStartsAt: auctionNow, startingBid: 0 });
    expect(auctionPhase(listing, now)).toEqual({
      phase: "open", bidding: { accepting: true, minimumBid: 0, endsAt: listing.auctionEndsAt },
    });
  });

  it("asks for the current bid plus the increment up to the bid limit", () => {
    const listing = makeListing({ currentBid: MAX_INTEGER - 1, bidIncrement: 1 });
    expect(auctionPhase(listing, now)).toEqual({
      phase: "open", bidding: { accepting: true, minimumBid: MAX_INTEGER, endsAt: listing.auctionEndsAt },
    });
  });
});

describe("isDue", () => {
  it.each([
    [{ auctionEndsAt: auctionNow }, true],
    [{ auctionEndsAt: new Date(now + 1) }, false],
    [{ auctionEndsAt: null }, false],
    [{ status: "ENDED", auctionEndsAt: auctionNow }, false],
  ] as const)("%j due: %s", (overrides, expected) => {
    expect(isDue(makeListing(overrides), auctionNow)).toBe(expected);
  });
});

describe("settle", () => {
  it.each([
    [null, null, "RESERVE_NOT_MET"],
    [100, null, "SOLD"],
    [100, 100, "SOLD"],
    [99, 100, "RESERVE_NOT_MET"],
  ] as const)("bid %s against reserve %s settles %s", (bid, reserve, expected) => {
    expect(settle(bid, reserve)).toBe(expected);
  });
});

describe("extendedDeadline", () => {
  const endsAt = new Date(now + EXTENSION_WINDOW_MS + 1);

  it("keeps the deadline for a bid outside the window", () => {
    expect(extendedDeadline(endsAt, auctionNow)).toEqual({ extended: false, endsAt });
  });

  it("resets the deadline to the window after a late bid", () => {
    const lateBid = new Date(now + 1000);
    expect(extendedDeadline(endsAt, lateBid)).toEqual({ extended: true, endsAt: new Date(now + 1000 + EXTENSION_WINDOW_MS) });
  });
});

describe("display", () => {
  it.each([
    [{ status: "UPCOMING" }, "Coming soon", "Starting bid", 10000],
    [{}, "Live auction", "Starting bid", 10000],
    [{ currentBid: 12000 }, "Live auction", "Current bid", 12000],
    [{ currentBid: 12000, auctionEndsAt: auctionNow }, "Closing", "Current bid", 12000],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000 }, "Sold", "Sold for", 12000],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 9000 }, "Ended", "Highest bid", 9000],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: null }, "Ended", "No bids", null],
  ] as const)("%j shows %s · %s %s", (overrides, status, label, amount) => {
    const listing = makeListing(overrides);
    expect(phaseLabel(auctionPhase(listing, now))).toBe(status);
    expect(auctionPrice(listing)).toEqual({ label, amount });
  });
});
