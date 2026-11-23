import { MAX_INTEGER } from "@/app/schemas/common";
import type { Listing } from "@/app/types/database";

// The Auction lifecycle: every caller that needs to know where an auction is
// (cards, the listing page, routes, finalization, notifications) reads the
// phase from here instead of re-deriving it from stored status, result and
// deadline. See GLOSSARY.md for the phase names.

export type AuctionResult = "SOLD" | "RESERVE_NOT_MET";

type StoredAuction = Pick<Listing,
  "status" | "result" | "auctionStartsAt" | "auctionEndsAt" |
  "startingBid" | "currentBid" | "bidIncrement" | "highestBidderId"
>;

export type BiddingBlock = "missing-schedule" | "not-started" | "unconfigured" | "limit-reached";

export type Bidding =
  | { accepting: true; minimumBid: number; endsAt: Date }
  | { accepting: false; reason: BiddingBlock };

export type AuctionPhase =
  | { phase: "upcoming" }
  | { phase: "open"; bidding: Bidding }
  | { phase: "closing" }
  | { phase: "sold"; price: number | null; buyerId: string | null }
  | { phase: "unsold"; reason: "no-bids" | "reserve-not-met"; highestBid: number | null };

/** Stored statuses in lifecycle order. Live updates never move backwards. */
export const auctionStatusOrder = ["UPCOMING", "LIVE", "ENDED"] as const;

/** A bid inside this window before the deadline resets it to this long after the bid. */
export const EXTENSION_WINDOW_MS = 2 * 60 * 1000;

function validTime(date: Date | null) {
  const time = date?.getTime();
  return time !== undefined && Number.isFinite(time) ? time : null;
}

export function auctionPhase(auction: StoredAuction, now: number): AuctionPhase {
  const { status, result, currentBid, highestBidderId } = auction;
  if (status === "ENDED") {
    if (result === "SOLD") return { phase: "sold", price: currentBid, buyerId: highestBidderId };
    return currentBid === null
      ? { phase: "unsold", reason: "no-bids", highestBid: null }
      : { phase: "unsold", reason: "reserve-not-met", highestBid: currentBid };
  }
  if (status !== "LIVE") return { phase: "upcoming" };

  const startsAt = validTime(auction.auctionStartsAt);
  const endsAt = validTime(auction.auctionEndsAt);
  if (endsAt !== null && now >= endsAt) return { phase: "closing" };
  return { phase: "open", bidding: bidding(auction, startsAt, endsAt, now) };
}

function bidding(auction: StoredAuction, startsAt: number | null, endsAt: number | null, now: number): Bidding {
  const { startingBid, currentBid, bidIncrement } = auction;
  if (startsAt === null || endsAt === null) return { accepting: false, reason: "missing-schedule" };
  if (now < startsAt) return { accepting: false, reason: "not-started" };
  if (startingBid === null || bidIncrement === null) return { accepting: false, reason: "unconfigured" };

  const minimumBid = currentBid === null ? startingBid : currentBid + bidIncrement;
  if (!Number.isSafeInteger(minimumBid) || minimumBid > MAX_INTEGER) return { accepting: false, reason: "limit-reached" };
  return { accepting: true, minimumBid, endsAt: new Date(endsAt) };
}

/** True once a live auction's deadline has passed and it awaits Finalization. */
export function isDue<T extends Pick<Listing, "status" | "auctionEndsAt">>(
  auction: T,
  now: Date
): auction is T & { auctionEndsAt: Date } {
  return auction.status === "LIVE" && auction.auctionEndsAt !== null && auction.auctionEndsAt <= now;
}

/** The Result an auction settles to when it is finalized. */
export function settle(currentBid: number | null, reservePrice: number | null): AuctionResult {
  return currentBid === null || (reservePrice !== null && currentBid < reservePrice)
    ? "RESERVE_NOT_MET"
    : "SOLD";
}

/** The deadline after a bid at `bidTime`, applying the Extension rule. */
export function extendedDeadline(endsAt: Date, bidTime: Date) {
  const extended = endsAt.getTime() - bidTime.getTime() <= EXTENSION_WINDOW_MS;
  return { extended, endsAt: extended ? new Date(bidTime.getTime() + EXTENSION_WINDOW_MS) : endsAt };
}

const phaseLabels = {
  upcoming: "Coming soon",
  open: "Live auction",
  closing: "Closing",
  sold: "Sold",
  unsold: "Ended",
} as const satisfies Record<AuctionPhase["phase"], string>;

export function phaseLabel(phase: AuctionPhase) {
  return phaseLabels[phase.phase];
}

/**
 * The price an auction shows and what to call it. It depends only on stored
 * state, so lists without a clock (inventory sorting, server pages) can use it.
 */
export function auctionPrice(auction: Pick<Listing, "status" | "result" | "startingBid" | "currentBid">) {
  const { status, result, startingBid, currentBid } = auction;
  if (status === "ENDED") {
    if (result === "SOLD") return { label: "Sold for", amount: currentBid };
    return currentBid === null ? { label: "No bids", amount: null } : { label: "Highest bid", amount: currentBid };
  }
  if (status === "LIVE" && currentBid !== null) return { label: "Current bid", amount: currentBid };
  return { label: "Starting bid", amount: startingBid };
}

/** The bid an open auction will accept right now, or null when it is not accepting bids. */
export function acceptedBid(phase: AuctionPhase | null) {
  return phase?.phase === "open" && phase.bidding.accepting ? phase.bidding : null;
}
