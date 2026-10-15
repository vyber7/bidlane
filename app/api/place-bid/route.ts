import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { pusherServer } from "@/app/libs/pusher";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
  requireSafeInteger,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import type { AcceptedBidResponse, AuctionEndTimeEvent, BidEvent } from "@/app/types/auction-events";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const bidAmount = requireSafeInteger(body.bidAmount, "Bid amount");
    const bidTime = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });

      if (!listing) throw new ApiRequestError(404, "Listing not found");
      if (listing.userId === currentUser.id) {
        throw new ApiRequestError(403, "Sellers cannot bid on their listing");
      }
      if (
        listing.status !== "LIVE" ||
        !listing.auctionStartsAt ||
        !listing.auctionEndsAt ||
        listing.auctionStartsAt > bidTime ||
        listing.auctionEndsAt <= bidTime
      ) {
        throw new ApiRequestError(409, "Auction is not open for bidding");
      }
      if (listing.startingBid === null || listing.bidIncrement === null) {
        throw new ApiRequestError(409, "Auction bidding is not configured");
      }

      const minimumBid =
        listing.currentBid === null
          ? listing.startingBid
          : listing.currentBid + listing.bidIncrement;

      if (!Number.isSafeInteger(minimumBid) || minimumBid > 2_147_483_647) {
        throw new ApiRequestError(409, "Auction cannot accept a higher bid");
      }

      if (bidAmount < minimumBid) {
        throw new ApiRequestError(
          400,
          `Bid must be at least ${minimumBid}`
        );
      }

      const shouldExtend =
        listing.auctionEndsAt.getTime() - bidTime.getTime() <= 2 * 60 * 1000;
      const auctionEndsAt = shouldExtend
        ? new Date(bidTime.getTime() + 2 * 60 * 1000)
        : listing.auctionEndsAt;

      // Optimistic locking on the previous price and end time prevents two
      // concurrent requests from both becoming the accepted highest bid.
      const claimedListing = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: "LIVE",
          // MongoDB distinguishes an absent field from an explicit null.
          // Both represent an auction that has not received its first bid.
          ...(listing.currentBid === null
            ? { OR: [{ currentBid: null }, { currentBid: { isSet: false } }] }
            : { currentBid: listing.currentBid }),
          auctionEndsAt: listing.auctionEndsAt,
        },
        data: {
          currentBid: bidAmount,
          highestBidderId: currentUser.id,
          auctionEndsAt,
        },
      });

      if (claimedListing.count !== 1) {
        throw new ApiRequestError(
          409,
          "The auction changed while placing this bid; please try again"
        );
      }

      const newBid = await tx.bid.create({
        data: {
          amount: bidAmount,
          createdAt: bidTime,
          listingId,
          userId: currentUser.id,
        },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          listingId: true,
          userId: true,
          user: { select: { name: true } },
        },
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { bidders: { connect: { id: currentUser.id } } },
      });
      await tx.user.update({
        where: { id: currentUser.id },
        data: { bidOnList: { connect: { id: listingId } } },
      });

      return { newBid, auctionEndsAt, shouldExtend };
    });

    // A notification failure must not turn an already-committed bid into a 500
    // response, since a retry could submit the same bid a second time.
    const bid = { ...result.newBid, createdAt: result.newBid.createdAt.toISOString() } satisfies BidEvent;
    const notifications: Promise<unknown>[] = [
      pusherServer.trigger(`listing-${listingId}`, "new-bid", bid),
    ];
    if (result.shouldExtend) {
      notifications.push(
        pusherServer.trigger(`listing-${listingId}`, "new-end-time", {
          newEndTime: result.auctionEndsAt.toISOString(),
        } satisfies AuctionEndTimeEvent)
      );
    }
    const notificationResults = await Promise.allSettled(notifications);
    if (notificationResults.some((item) => item.status === "rejected")) {
      logger.warn("bid.notification_failed", { listingId });
    }

    return NextResponse.json(
      {
        bid,
        currentBid: result.newBid.amount,
        auctionEndsAt: result.auctionEndsAt.toISOString(),
      } satisfies AcceptedBidResponse,
      { status: 201 }
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("bid.place_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
