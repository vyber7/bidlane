import { auctionPrice, type AuctionPhase, type BiddingBlock } from "./auction-lifecycle";
import type { PublicListing } from "./listing-payload";

// The auction display: what any view shows for an Auction, given its phase and
// who is looking. Views render this description instead of re-deriving it
// from the phase and stored status. See GLOSSARY.md for the phase names.

export interface AuctionDisplay {
  /** The phase as a short label, for badges and chips. */
  headline: "Coming soon" | "Live auction" | "Closing" | "Sold" | "Ended";
  /** How a view may colour the headline. */
  tone: "upcoming" | "live" | "sold" | "neutral";
  /** Where the homepage inventory files the Auction: Live is Open and Closing. */
  bucket: "upcoming" | "live" | "results";
  price: { label: string; amount: number | null };
  /** Countdown while bids may arrive; closing once the deadline has passed and the Result is pending. */
  timer: "countdown" | "closing" | "none";
  /** What this viewer can do next, if anything. */
  action: "place-bid" | "view-bids" | "retry-finalization" | "watch" | "edit-listing" | null;
  /** Guidance for this viewer, including why they cannot bid. */
  message: string | null;
  /** The outcome of an ended Auction. */
  result: "Auction complete" | "No bids placed" | "Reserve not met" | null;
  noReserveNote: string | null;
  /** The lowest bid the Auction accepts right now, or null when it is not accepting bids. */
  minimumBid: number | null;
}

type DisplayedAuction = Pick<PublicListing, "userId" | "status" | "result" | "startingBid" | "currentBid" | "isNoReserve">;

/**
 * Describes an Auction to a viewer. A null phase means a live Auction whose
 * client clock has not synced yet, as `useAuction` reports it.
 */
export function describeAuction(
  listing: DisplayedAuction,
  phase: AuctionPhase | null,
  viewerId: string | null | undefined,
): AuctionDisplay {
  const display = describePhase(phase, viewerId === listing.userId);
  return {
    ...display,
    price: auctionPrice(listing),
    noReserveNote: !listing.isNoReserve ? null
      : display.bucket === "results" ? "This auction had no reserve."
      : "No minimum sale price. The highest accepted bid wins.",
    minimumBid: phase?.phase === "open" && phase.bidding.accepting ? phase.bidding.minimumBid : null,
  };
}

function describePhase(
  phase: AuctionPhase | null,
  owner: boolean,
): Omit<AuctionDisplay, "price" | "noReserveNote" | "minimumBid"> {
  const ended = { timer: "none", action: null, message: null } as const;

  switch (phase?.phase) {
    case "upcoming":
      return {
        headline: "Coming soon",
        tone: "upcoming",
        bucket: "upcoming",
        timer: "none",
        action: owner ? "edit-listing" : "watch",
        message: `Bidding hasn’t opened yet. ${owner
          ? "Set up your auction below when you’re ready."
          : "Add this vehicle to your watchlist to find it again easily."}`,
        result: null,
      };
    case "sold":
      return {
        ...ended,
        headline: "Sold",
        tone: "sold",
        bucket: "results",
        result: "Auction complete",
      };
    case "unsold":
      return {
        ...ended,
        headline: "Ended",
        tone: "neutral",
        bucket: "results",
        result: phase.reason === "no-bids" ? "No bids placed" : "Reserve not met",
      };
    case "closing":
      return {
        headline: "Closing",
        tone: "live",
        bucket: "live",
        timer: "closing",
        action: owner ? "retry-finalization" : null,
        message: "Finalizing results…",
        result: null,
      };
    case "open":
    case undefined: {
      // Without a phase the client clock has not synced yet, so the live
      // Auction cannot yet say whether it accepts bids.
      const bidding = phase?.bidding;
      return {
        headline: "Live auction",
        tone: "live",
        bucket: "live",
        timer: "countdown",
        action: owner ? "view-bids" : bidding?.accepting ? "place-bid" : null,
        message: owner ? "Your auction is live. Results are finalized automatically when the timer ends."
          : !bidding ? "Syncing auction…"
          : bidding.accepting ? null
          : blockedMessage(bidding.reason),
        result: null,
      };
    }
  }
}

function blockedMessage(reason: BiddingBlock) {
  return reason === "missing-schedule" || reason === "unconfigured"
    ? "Bidding is unavailable until the auction is configured."
    : "Bidding unavailable";
}
