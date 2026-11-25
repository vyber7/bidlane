import { describe, expect, it } from "vitest";
import type { Listing } from "@/app/types/database";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import { decodeListing } from "./listing-codec";
import { listingCapabilities, type Viewer } from "./listing-capabilities";

const now = auctionNow.getTime();

const phases = {
  upcoming: { status: "UPCOMING", auctionStartsAt: null, auctionEndsAt: null },
  open: {},
  closing: { auctionEndsAt: auctionNow, currentBid: 12000, highestBidderId: "buyer" },
  sold: { status: "ENDED", result: "SOLD", currentBid: 12000, highestBidderId: "buyer" },
  unsold: { status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 9000, highestBidderId: "buyer", reservePrice: 20000 },
} satisfies Record<string, Partial<Listing>>;
type Phase = keyof typeof phases;

const viewers = {
  anonymous: null,
  other: { id: "other" },
  seller: { id: "seller" },
  admin: { id: "admin", role: "ADMIN" },
  buyer: { id: "buyer" },
} satisfies Record<string, Viewer>;
type ViewerName = keyof typeof viewers;

function capabilitiesOf(phase: Phase, viewer: ViewerName, overrides: Partial<Listing> = {}) {
  const listing = decodeListing(makeListing({ ...phases[phase], ...overrides }));
  return listingCapabilities(listing, viewers[viewer], now);
}

const allPhases = Object.keys(phases) as Phase[];
const allViewers = Object.keys(viewers) as ViewerName[];
const reviewStates = [null, "PENDING", "APPROVED", "CHANGES_REQUESTED"] as const;
const afterBiddingOpens = allPhases.filter((phase) => phase !== "upcoming");

describe("listingCapabilities: start", () => {
  it("lets the seller start an Upcoming Auction with Approval", () => {
    expect(capabilitiesOf("upcoming", "seller", { reviewStatus: "APPROVED" }).start).toEqual({ allowed: true });
  });

  it.each([null, "PENDING", "CHANGES_REQUESTED"] as const)("refuses the seller while the Review state is %s", (reviewStatus) => {
    expect(capabilitiesOf("upcoming", "seller", { reviewStatus }).start).toEqual({ allowed: false, reason: "not-approved" });
  });

  it.each(["anonymous", "other", "admin", "buyer"] as const)("refuses %s, who is not the seller", (viewer) => {
    expect(capabilitiesOf("upcoming", viewer, { reviewStatus: "APPROVED" }).start).toEqual({ allowed: false, reason: "not-seller" });
  });

  it.each(afterBiddingOpens)("refuses the seller once the Auction is %s", (phase) => {
    expect(capabilitiesOf(phase, "seller", { reviewStatus: "APPROVED" }).start).toEqual({ allowed: false, reason: "not-upcoming" });
  });
});

describe("listingCapabilities: correct", () => {
  it.each(reviewStates)("lets the seller correct an Upcoming Listing whose Review state is %s", (reviewStatus) => {
    expect(capabilitiesOf("upcoming", "seller", { reviewStatus }).correct).toEqual({ allowed: true });
  });

  it.each(["anonymous", "other", "admin", "buyer"] as const)("refuses %s, who is not the seller", (viewer) => {
    expect(capabilitiesOf("upcoming", viewer).correct).toEqual({ allowed: false, reason: "not-seller" });
  });

  it.each(afterBiddingOpens)("refuses the seller once the Auction is %s", (phase) => {
    expect(capabilitiesOf(phase, "seller").correct).toEqual({ allowed: false, reason: "not-upcoming" });
  });
});

describe("listingCapabilities: review", () => {
  it.each(reviewStates)("lets an administrator review an Upcoming Listing whose Review state is %s", (reviewStatus) => {
    expect(capabilitiesOf("upcoming", "admin", { reviewStatus }).review).toEqual({ allowed: true });
  });

  it.each(["anonymous", "other", "seller", "buyer"] as const)("refuses %s, who is not an administrator", (viewer) => {
    expect(capabilitiesOf("upcoming", viewer).review).toEqual({ allowed: false, reason: "not-admin" });
  });

  it.each(afterBiddingOpens)("refuses an administrator once the Auction is %s", (phase) => {
    expect(capabilitiesOf(phase, "admin", { reviewStatus: "APPROVED" }).review).toEqual({ allowed: false, reason: "not-upcoming" });
  });
});

describe("listingCapabilities: seeReviewStatus", () => {
  it.each(["seller", "admin"] as const)("shows %s the Review status of an Upcoming Listing", (viewer) => {
    expect(capabilitiesOf("upcoming", viewer).seeReviewStatus).toBe(true);
  });

  it.each(["anonymous", "other", "buyer"] as const)("hides the Review status from %s", (viewer) => {
    expect(capabilitiesOf("upcoming", viewer, { reviewStatus: "APPROVED" }).seeReviewStatus).toBe(false);
  });

  it.each(afterBiddingOpens)("hides the Review status from the seller once the Auction is %s", (phase) => {
    expect(capabilitiesOf(phase, "seller").seeReviewStatus).toBe(false);
  });
});

describe("listingCapabilities: completeTransaction", () => {
  it("lets the winning buyer complete the transaction on a Sold Auction", () => {
    expect(capabilitiesOf("sold", "buyer").completeTransaction).toEqual({ role: "buyer", canComplete: true });
  });

  it("lets the seller complete the transaction on a Sold Auction with a buyer", () => {
    expect(capabilitiesOf("sold", "seller").completeTransaction).toEqual({ role: "seller", canComplete: true });
  });

  it("gives the seller no checklist when they are their own highest bidder", () => {
    expect(capabilitiesOf("sold", "seller", { highestBidderId: "seller" }).completeTransaction).toEqual({ role: "seller", canComplete: false });
  });

  it("gives the seller no checklist when a Sold Auction has no recorded buyer", () => {
    expect(capabilitiesOf("sold", "seller", { highestBidderId: null }).completeTransaction).toEqual({ role: "seller", canComplete: false });
  });

  it.each(["anonymous", "other", "admin"] as const)("offers %s nothing on a Sold Auction", (viewer) => {
    expect(capabilitiesOf("sold", viewer).completeTransaction).toBeNull();
  });

  it.each(["upcoming", "open", "closing", "unsold"] as const)("offers nobody a transaction while the Auction is %s", (phase) => {
    for (const viewer of allViewers) expect(capabilitiesOf(phase, viewer).completeTransaction).toBeNull();
  });
});

describe("listingCapabilities: group", () => {
  it.each([
    ["upcoming", "upcoming"],
    ["open", "live"],
    ["closing", "live"],
    ["sold", "results"],
    ["unsold", "results"],
  ] as const)("files a %s Auction under %s for every viewer", (phase, group) => {
    for (const viewer of allViewers) expect(capabilitiesOf(phase, viewer).group).toBe(group);
  });
});

describe("listingCapabilities: legacy Listings", () => {
  it("treats a Listing stored without a status or Review state as Upcoming and Awaiting review", () => {
    const stored: Partial<Listing> = makeListing(phases.upcoming);
    delete stored.status;
    delete stored.reviewStatus;
    const listing = decodeListing(stored);
    expect(listingCapabilities(listing, viewers.seller, now)).toEqual({
      start: { allowed: false, reason: "not-approved" },
      correct: { allowed: true },
      review: { allowed: false, reason: "not-admin" },
      seeReviewStatus: true,
      completeTransaction: null,
      group: "upcoming",
    });
  });
});
