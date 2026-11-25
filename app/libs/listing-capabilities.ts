import type { DecodedListing, ReviewStatus } from "./listing-codec";
import { auctionPhase, type AuctionPhase } from "./auction-lifecycle";
import { soldAuction } from "./transaction-completion";

// Listing capabilities: what a viewer may do with a Listing right now, and
// which group its Auction belongs in. Commands guard with these answers and
// pages render from them, so no caller re-derives a rule from the stored
// status. Free of server, database and React dependencies so every layer can
// use it. See GLOSSARY.md for the phase and Review terms.

/** Who is asking. Nobody when signed out. */
export type Viewer = { id: string; role?: string | null } | null | undefined;

export type CapabilityRefusal = "not-seller" | "not-admin" | "not-upcoming" | "not-approved";
/** Whether the viewer may do something, and if not, why. */
export type Capability<Reason extends CapabilityRefusal = CapabilityRefusal> =
  | { allowed: true }
  | { allowed: false; reason: Reason };

/** The viewer's part in a Sold Auction, and whether they have a checklist to complete. */
export type TransactionAccess =
  | { role: "buyer"; canComplete: true }
  | { role: "seller"; canComplete: boolean };

/** Where pages file an Auction: Live is Open and Closing, Results is Sold and Unsold. */
export type AuctionGroup = "upcoming" | "live" | "results";

export interface ListingCapabilities {
  /** Start the Auction. */
  start: Capability<"not-seller" | "not-upcoming" | "not-approved">;
  /** Make a Correction, including uploading a file for the Listing. */
  correct: Capability<"not-seller" | "not-upcoming">;
  /** Record a Review decision. */
  review: Capability<"not-admin" | "not-upcoming">;
  /** See the Listing's Review state on the listing page. */
  seeReviewStatus: boolean;
  completeTransaction: TransactionAccess | null;
  group: AuctionGroup;
}

export type CapabilityListing = Pick<DecodedListing,
  "userId" | "status" | "result" | "reviewStatus" | "highestBidderId" |
  "auctionStartsAt" | "auctionEndsAt" | "startingBid" | "currentBid" | "bidIncrement"
>;

const allowed = { allowed: true } as const;
const refused = <Reason extends CapabilityRefusal>(reason: Reason) => ({ allowed: false, reason }) as const;

export function listingCapabilities(listing: CapabilityListing, viewer: Viewer, now: number): ListingCapabilities {
  const phase = auctionPhase(listing, now);
  const upcoming = phase.phase === "upcoming";
  const seller = Boolean(viewer && viewer.id === listing.userId);
  const admin = viewer?.role === "ADMIN";

  const correct = !seller ? refused("not-seller") : !upcoming ? refused("not-upcoming") : allowed;
  return {
    start: !correct.allowed ? correct : !isApproved(listing) ? refused("not-approved") : allowed,
    correct,
    review: !admin ? refused("not-admin") : !upcoming ? refused("not-upcoming") : allowed,
    seeReviewStatus: upcoming && (seller || admin),
    completeTransaction: transactionAccess(listing, viewer?.id),
    group: auctionGroup(phase),
  };
}

/** Approval: the Review decision that makes an Upcoming Listing public and lets its seller start the Auction. */
export function isApproved(listing: { reviewStatus: ReviewStatus | null }) {
  return listing.reviewStatus === "APPROVED";
}

/** The group a stored Auction is filed under at `now`. */
export function listingGroup(listing: Parameters<typeof auctionPhase>[0], now: number) {
  return auctionGroup(auctionPhase(listing, now));
}

/** The group an Auction in this phase is filed under. */
export function auctionGroup(phase: AuctionPhase | null): AuctionGroup {
  switch (phase?.phase) {
    case "upcoming": return "upcoming";
    case "sold":
    case "unsold": return "results";
    // A null phase is a live Auction whose client clock has not synced yet.
    default: return "live";
  }
}

type TransactionListing = Pick<DecodedListing, "userId" | "status" | "result" | "highestBidderId">;

/**
 * Who may complete the transaction on a Sold Auction: its buyer, and its seller
 * when there is a buyer who is not the seller. Narrower than
 * listingCapabilities for callers that only hold a sold record.
 */
export function transactionAccess(listing: TransactionListing, viewerId: string | null | undefined): TransactionAccess | null {
  if (!viewerId || listing.status !== soldAuction.status || listing.result !== soldAuction.result) return null;
  const buyerId = listing.highestBidderId !== listing.userId ? listing.highestBidderId : null;
  if (viewerId === listing.userId) return { role: "seller", canComplete: Boolean(buyerId) };
  return viewerId === buyerId ? { role: "buyer", canComplete: true } : null;
}
