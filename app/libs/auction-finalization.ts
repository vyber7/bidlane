import { Prisma } from "@prisma/client";
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { pusherServer } from "@/app/libs/pusher";

const finalizationListingSelect = {
  id: true,
  status: true,
  result: true,
  auctionEndsAt: true,
  currentBid: true,
  reservePrice: true,
} satisfies Prisma.ListingSelect;

type FinalizationListing = Prisma.ListingGetPayload<{
  select: typeof finalizationListingSelect;
}>;

export type AuctionResult = "SOLD" | "RESERVE_NOT_MET";

export type AuctionFinalization =
  | {
      status: "finalized";
      result: AuctionResult;
      auctionEndsAt: Date;
    }
  | { status: "not_found" }
  | { status: "not_due"; auctionEndsAt: Date | null }
  | { status: "already_finalized"; result: string | null };

export interface AuctionFinalizationBatch {
  checked: number;
  finalized: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
}

export function determineAuctionResult(
  currentBid: number | null,
  reservePrice: number | null
): AuctionResult {
  return currentBid === null ||
    (reservePrice !== null && currentBid < reservePrice)
    ? "RESERVE_NOT_MET"
    : "SOLD";
}

async function notifyAuctionEnded(
  listingId: string,
  auctionEndsAt: Date,
  result: AuctionResult
) {
  const notification = await Promise.allSettled([
    pusherServer.trigger(`listing-${listingId}`, "auction-ended", {
      auctionEndsAt,
      result,
    }),
  ]);

  if (notification[0]?.status === "rejected") {
    logger.warn("auction.end_notification_failed", { listingId });
  }
}

async function resolveCompetingFinalization(
  listingId: string,
  now: Date,
  retriesRemaining: number
): Promise<AuctionFinalization> {
  const current = await prisma.listing.findUnique({
    where: { id: listingId },
    select: finalizationListingSelect,
  });

  if (!current) return { status: "not_found" };
  if (current.status !== "LIVE") {
    return { status: "already_finalized", result: current.result };
  }

  if (!current.auctionEndsAt || current.auctionEndsAt > now) {
    return { status: "not_due", auctionEndsAt: current.auctionEndsAt };
  }

  if (retriesRemaining > 0) {
    return finalizeCandidate(current, now, retriesRemaining - 1);
  }

  throw new Error(`Unable to claim expired auction ${listingId}`);
}

async function finalizeCandidate(
  listing: FinalizationListing,
  now: Date,
  retriesRemaining = 1
): Promise<AuctionFinalization> {
  if (listing.status !== "LIVE") {
    return { status: "already_finalized", result: listing.result };
  }
  if (!listing.auctionEndsAt || listing.auctionEndsAt > now) {
    return { status: "not_due", auctionEndsAt: listing.auctionEndsAt };
  }

  const result = determineAuctionResult(
    listing.currentBid,
    listing.reservePrice
  );

  // Matching the exact end time is the optimistic lock. If a last-second bid
  // extends the auction, that update wins and this finalization claim fails.
  const claimed = await prisma.listing.updateMany({
    where: {
      id: listing.id,
      status: "LIVE",
      auctionEndsAt: listing.auctionEndsAt,
    },
    data: {
      status: "ENDED",
      result,
    },
  });

  if (claimed.count !== 1) {
    return resolveCompetingFinalization(listing.id, now, retriesRemaining);
  }

  await notifyAuctionEnded(listing.id, listing.auctionEndsAt, result);
  return { status: "finalized", result, auctionEndsAt: listing.auctionEndsAt };
}

export async function finalizeAuction(
  listingId: string,
  now = new Date()
): Promise<AuctionFinalization> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: finalizationListingSelect,
  });

  if (!listing) return { status: "not_found" };
  return finalizeCandidate(listing, now);
}

export async function finalizeExpiredAuctions(
  now = new Date(),
  batchSize = 100
): Promise<AuctionFinalizationBatch> {
  const safeBatchSize = Math.min(Math.max(Math.trunc(batchSize), 1), 100);
  const candidates = await prisma.listing.findMany({
    where: {
      status: "LIVE",
      auctionEndsAt: { lte: now },
    },
    orderBy: { auctionEndsAt: "asc" },
    take: safeBatchSize,
    select: finalizationListingSelect,
  });

  const outcomes = await Promise.allSettled(
    candidates.map((listing) => finalizeCandidate(listing, now))
  );

  let finalized = 0;
  let skipped = 0;
  let failed = 0;

  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      failed += 1;
      logger.error("auction.scheduled_finalization_failed", outcome.reason, {
        listingId: candidates[index]?.id,
      });
    } else if (outcome.value.status === "finalized") {
      finalized += 1;
    } else {
      skipped += 1;
    }
  });

  return {
    checked: candidates.length,
    finalized,
    skipped,
    failed,
    hasMore: candidates.length === safeBatchSize,
  };
}
