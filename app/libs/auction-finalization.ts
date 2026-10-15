import { Prisma } from "@prisma/client";
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { pusherServer } from "@/app/libs/pusher";
import type { AuctionEndedEvent } from "@/app/types/auction-events";
import { auctionResultNotifications, publishNotificationChanges, saveNotifications } from "./notifications";

const finalizationListingSelect = {
  id: true,
  status: true,
  result: true,
  auctionEndsAt: true,
  currentBid: true,
  reservePrice: true,
  highestBidderId: true,
  biddersIds: true,
  userId: true,
  year: true,
  make: true,
  model: true,
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
  result: AuctionResult,
  userIds: string[]
) {
  const notification = await Promise.allSettled([
    publishNotificationChanges(userIds),
    pusherServer.trigger(`listing-${listingId}`, "auction-ended", {
      auctionEndsAt: auctionEndsAt.toISOString(),
      result,
    } satisfies AuctionEndedEvent),
  ]);

  if (notification.some((item) => item.status === "rejected")) {
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

  // Match the price as well as the deadline so notifications describe the
  // winning bid even if an in-flight bid commits after the candidate was read.
  let notificationUsers: string[] | null;
  try {
    notificationUsers = await prisma.$transaction(async (tx) => {
      const claimed = await tx.listing.updateMany({
        where: {
          id: listing.id,
          status: "LIVE",
          auctionEndsAt: listing.auctionEndsAt,
          ...(listing.currentBid === null
            ? { OR: [{ currentBid: null }, { currentBid: { isSet: false } }] }
            : { currentBid: listing.currentBid }),
        },
        data: { status: "ENDED", result },
      });
      if (claimed.count !== 1) return null;
      return saveNotifications(tx, auctionResultNotifications(listing, result, listing.auctionEndsAt!));
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return resolveCompetingFinalization(listing.id, now, retriesRemaining);
    }
    throw error;
  }

  if (notificationUsers === null) {
    return resolveCompetingFinalization(listing.id, now, retriesRemaining);
  }

  await notifyAuctionEnded(listing.id, listing.auctionEndsAt, result, notificationUsers);
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
