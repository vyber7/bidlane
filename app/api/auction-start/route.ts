import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
  requireSafeInteger,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { pusherServer } from "@/app/libs/pusher";
import { auctionLiveNotifications, publishNotificationChanges, saveNotifications } from "@/app/libs/notifications";
import type { AuctionStartedEvent } from "@/app/types/auction-events";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const startingBid = requireSafeInteger(body.startingBid, "Starting bid", {
      allowZero: true,
    });
    const bidIncrement = requireSafeInteger(body.bidIncrement, "Bid increment");
    if (startingBid + bidIncrement > 2_147_483_647) {
      throw new ApiRequestError(400, "Starting bid plus increment is too large");
    }
    const endTime =
      typeof body.endTime === "string" || typeof body.endTime === "number"
        ? new Date(body.endTime)
        : null;
    const startTime = new Date();

    if (!endTime || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
      throw new ApiRequestError(400, "End time must be in the future");
    }

    const notificationUsers = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (!listing) throw new ApiRequestError(404, "Listing not found");
      if (listing.userId !== currentUser.id) {
        throw new ApiRequestError(403, "Only the seller can start this auction");
      }
      if (listing.status !== "UPCOMING") {
        throw new ApiRequestError(409, "Only an upcoming auction can be started");
      }

      const updated = await tx.listing.updateMany({
        where: { id: listingId, userId: currentUser.id, status: "UPCOMING" },
        data: {
          auctionStartsAt: startTime,
          auctionEndsAt: endTime,
          startingBid,
          bidIncrement,
          status: "LIVE",
        },
      });

      if (updated.count !== 1) {
        throw new ApiRequestError(409, "Auction has already been started");
      }

      return saveNotifications(tx, auctionLiveNotifications(listing, startTime));
    });

    const notification = await Promise.allSettled([
      publishNotificationChanges(notificationUsers),
      pusherServer.trigger(`listing-${listingId}`, "auction-started", {
        auctionStartsAt: startTime.toISOString(),
        auctionEndsAt: endTime.toISOString(),
        startingBid,
        bidIncrement,
      } satisfies AuctionStartedEvent),
    ]);
    if (notification.some((item) => item.status === "rejected")) {
      logger.warn("auction.start_notification_failed", { listingId });
    }

    return NextResponse.json(
      { message: "Auction started", auctionStartsAt: startTime, auctionEndsAt: endTime },
      { status: 201 }
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("auction.start_failed", error);
    return errorResponse("Failed to create auction", 500);
  }
}
