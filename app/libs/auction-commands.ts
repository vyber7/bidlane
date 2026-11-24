import { withNativeTransaction } from "./native-repositories";
import type { NativeRepositories } from "@/prisma/native/repositories";
import { auctionTransactionOptions, isDuplicateKey, isTransactionContention } from "@/prisma/native/transaction-errors";
import { listingChannel } from "./realtime/catalog";
import { notificationsChanged, publish } from "./realtime/server";
import { enforceAbuseLimit } from "./abuse-limits";
import {
  auctionLiveNotifications,
  outbidNotifications,
  saveNotifications,
} from "./notifications";
import { auctionPhase, extendedDeadline } from "./auction-lifecycle";
import { MAX_INTEGER } from "@/app/schemas/common";
import type { AcceptedBidResponse } from "@/app/types/auction-events";

// Auction commands: each one owns its transaction, retries, idempotency and
// the events it publishes after commit, and returns a typed outcome. Routes
// only parse requests and map rejections to HTTP. Finalization lives in
// auction-finalization.ts and follows the same shape.
//
// Every command reports transaction contention as the "busy" rejection.
// Abuse quota failures keep the quota module's own error mode and propagate.

// ---------------------------------------------------------------------------
// Place a bid

export interface BidRequest {
  bidder: { id: string; emailVerified?: Date | null };
  listingId: string;
  amount: number;
  /** The client's Idempotency-Key, scoped to the bidder. */
  key: string;
}

export type BidRejection =
  | { reason: "key-reused" }
  | { reason: "unverified" }
  | { reason: "not-found" }
  | { reason: "own-listing" }
  | { reason: "not-open" }
  | { reason: "unconfigured" }
  | { reason: "limit-reached" }
  | { reason: "below-minimum"; minimumBid: number }
  /** Another bid or Extension committed between reading and claiming the auction. */
  | { reason: "outpaced" }
  | { reason: "busy" };

export type BidOutcome =
  | { ok: true; replayed: boolean; response: AcceptedBidResponse }
  | ({ ok: false } & BidRejection);

type BidAttempt =
  | { ok: true; replayed: true; response: AcceptedBidResponse }
  | { ok: true; replayed: false; response: AcceptedBidResponse; extended: boolean; notificationUsers: string[] }
  | ({ ok: false } & BidRejection);

const MAX_BID_ATTEMPTS = 3;

export async function placeBid(request: BidRequest, now: () => Date = () => new Date()): Promise<BidOutcome> {
  // Keep quota writes outside the bid transaction so rejected bids count.
  // Cache only this request's admission across transaction retries.
  let admission: Promise<BidRejection | null> | undefined;
  const admit = () => admission ??= (async () => {
    if (!request.bidder.emailVerified) return { reason: "unverified" } as const;
    await enforceAbuseLimit("bid", request.bidder.id);
    return null;
  })();

  // The driver retries transient conflicts within a bounded native session.
  // Duplicate request-key races need a new transaction to read the winner;
  // the unique index remains the final guard. Never retry an unknown commit.
  for (let attempt = 1; ; attempt++) {
    let outcome: BidAttempt;
    try {
      outcome = await withNativeTransaction((tx) => attemptBid(tx, request, admit, now()), auctionTransactionOptions);
    } catch (error) {
      if (isTransactionContention(error)) return { ok: false, reason: "busy" };
      if (!isDuplicateKey(error)) throw error;
      if (attempt === MAX_BID_ATTEMPTS) return { ok: false, reason: "busy" };
      continue;
    }

    if (!outcome.ok || outcome.replayed) return outcome;
    // Publishing is best effort after commit. Replays never publish again.
    await publishAcceptedBid(request.listingId, outcome);
    return { ok: true, replayed: false, response: outcome.response };
  }
}

async function attemptBid(
  tx: NativeRepositories,
  { bidder, listingId, amount, key }: BidRequest,
  admit: () => Promise<BidRejection | null>,
  bidTime: Date,
): Promise<BidAttempt> {
  const previous = await tx.bidSubmissions.find(bidder.id, key);
  if (previous) {
    if (previous.listingId !== listingId || previous.amount !== amount) return { ok: false, reason: "key-reused" };
    // Accepted replays acknowledge history without placing another bid.
    return { ok: true, replayed: true, response: previous.response };
  }

  const refused = await admit();
  if (refused) return { ok: false, ...refused };

  const listing = await tx.auctions.find(listingId);
  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.userId === bidder.id) return { ok: false, reason: "own-listing" };

  const phase = auctionPhase(listing, bidTime.getTime());
  if (phase.phase !== "open") return { ok: false, reason: "not-open" };
  if (!phase.bidding.accepting) {
    const { reason } = phase.bidding;
    return { ok: false, reason: reason === "unconfigured" || reason === "limit-reached" ? reason : "not-open" };
  }

  const { minimumBid, endsAt } = phase.bidding;
  if (amount < minimumBid) return { ok: false, reason: "below-minimum", minimumBid };

  const { extended, endsAt: auctionEndsAt } = extendedDeadline(endsAt, bidTime);

  // Optimistic locking on the previous price and end time prevents two
  // concurrent requests from both becoming the accepted highest bid.
  const claimed = await tx.auctions.claimBid(listing, { amount, userId: bidder.id, auctionEndsAt }, bidTime);
  if (claimed.count !== 1) return { ok: false, reason: "outpaced" };

  const bid = await tx.auctions.createBid({ amount, createdAt: bidTime, listingId, userId: bidder.id });
  const notificationUsers = await saveNotifications(tx, outbidNotifications(listing, bid));
  const response = {
    bid: { ...bid, createdAt: bid.createdAt.toISOString() },
    currentBid: bid.amount,
    auctionEndsAt: auctionEndsAt.toISOString(),
  } satisfies AcceptedBidResponse;
  await tx.bidSubmissions.create({ userId: bidder.id, key, listingId, amount, response }, bidTime);
  return { ok: true, replayed: false, response, extended, notificationUsers };
}

async function publishAcceptedBid(
  listingId: string,
  { response, extended, notificationUsers }: { response: AcceptedBidResponse; extended: boolean; notificationUsers: string[] },
) {
  const channel = listingChannel(listingId);
  await publish("bid.realtime_update_failed", [
    { channel, event: "new-bid", payload: response.bid },
    ...(extended ? [{ channel, event: "new-end-time", payload: { newEndTime: response.auctionEndsAt } } as const] : []),
    ...notificationsChanged(notificationUsers),
  ], { listingId });
}

// ---------------------------------------------------------------------------
// Start an auction

export interface StartRequest {
  sellerId: string;
  listingId: string;
  startingBid: number;
  bidIncrement: number;
  endsAt: Date;
}

export type StartRejection =
  | "ends-in-past"
  | "ladder-too-large"
  | "not-found"
  | "not-seller"
  | "not-upcoming"
  | "not-approved"
  /** A competing start, or an approval change, committed first. */
  | "already-started"
  | "busy";

export type StartOutcome =
  | { ok: true; auctionStartsAt: Date; auctionEndsAt: Date }
  | { ok: false; reason: StartRejection };

export async function startAuction(request: StartRequest, now = new Date()): Promise<StartOutcome> {
  const { sellerId, listingId, startingBid, bidIncrement, endsAt } = request;
  // The first bid after the starting bid must still be a storable amount.
  if (startingBid + bidIncrement > MAX_INTEGER) return { ok: false, reason: "ladder-too-large" };
  if (!(endsAt > now)) return { ok: false, reason: "ends-in-past" };

  let started: { ok: false; reason: StartRejection } | { ok: true; notificationUsers: string[] };
  try {
    started = await withNativeTransaction(async (tx) => {
      const listing = await tx.auctions.find(listingId);
      if (!listing) return { ok: false, reason: "not-found" } as const;
      if (listing.userId !== sellerId) return { ok: false, reason: "not-seller" } as const;
      if (listing.status !== "UPCOMING") return { ok: false, reason: "not-upcoming" } as const;
      if (listing.reviewStatus !== "APPROVED") return { ok: false, reason: "not-approved" } as const;

      const updated = await tx.auctions.start(listing, { auctionStartsAt: now, auctionEndsAt: endsAt, startingBid, bidIncrement });
      if (updated.count !== 1) return { ok: false, reason: "already-started" } as const;

      return { ok: true, notificationUsers: await saveNotifications(tx, auctionLiveNotifications(listing, now)) } as const;
    }, auctionTransactionOptions);
  } catch (error) {
    if (isTransactionContention(error)) return { ok: false, reason: "busy" };
    throw error;
  }
  if (!started.ok) return started;

  await publish("auction.start_realtime_update_failed", [
    {
      channel: listingChannel(listingId),
      event: "auction-started",
      payload: { auctionStartsAt: now.toISOString(), auctionEndsAt: endsAt.toISOString(), startingBid, bidIncrement },
    },
    ...notificationsChanged(started.notificationUsers),
  ], { listingId });

  return { ok: true, auctionStartsAt: now, auctionEndsAt: endsAt };
}
