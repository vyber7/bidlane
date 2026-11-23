import { MAX_INTEGER } from "@/app/schemas/common";
import type { Listing } from "@/app/types/database";

type Auction = Pick<Listing,
  "status" | "auctionStartsAt" | "auctionEndsAt" | "startingBid" | "currentBid" | "bidIncrement"
>;

type BiddingState =
  | { state: "closed" | "missing-schedule" | "syncing" | "unconfigured" | "limit-reached" }
  | { state: "open"; minimumBid: number; endsAt: Date };

export function auctionBiddingState(auction: Auction, now: number | null): BiddingState {
  const { status, auctionStartsAt, auctionEndsAt, startingBid, currentBid, bidIncrement } = auction;
  if (status !== "LIVE") return { state: "closed" };
  if (!auctionStartsAt || !auctionEndsAt) return { state: "missing-schedule" };

  const startsAt = auctionStartsAt.getTime();
  const endsAt = auctionEndsAt.getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { state: "missing-schedule" };
  if (now === null) return { state: "syncing" };
  if (now < startsAt || now >= endsAt) return { state: "closed" };
  if (startingBid === null || bidIncrement === null) return { state: "unconfigured" };

  const minimumBid = currentBid === null ? startingBid : currentBid + bidIncrement;
  if (!Number.isSafeInteger(minimumBid) || minimumBid > MAX_INTEGER) return { state: "limit-reached" };

  return { state: "open", minimumBid, endsAt: auctionEndsAt };
}
