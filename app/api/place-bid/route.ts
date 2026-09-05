import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { pusherServer } from "@/app/libs/pusher";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
  requireSafeInteger,
} from "@/app/api/auction-security";
import { logger } from "@/app/libs/logger";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return new NextResponse("Unauthorized", { status: 401 });

    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const bidAmount = requireSafeInteger(body.bidAmount, "Bid amount");
    const bidTime = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });

      if (!listing) throw new AuctionRequestError(404, "Listing not found");
      if (listing.userId === currentUser.id) {
        throw new AuctionRequestError(403, "Sellers cannot bid on their listing");
      }
      if (
        listing.status !== "LIVE" ||
        !listing.auctionStartsAt ||
        !listing.auctionEndsAt ||
        listing.auctionStartsAt > bidTime ||
        listing.auctionEndsAt <= bidTime
      ) {
        throw new AuctionRequestError(409, "Auction is not open for bidding");
      }
      if (listing.startingBid === null || listing.bidIncrement === null) {
        throw new AuctionRequestError(409, "Auction bidding is not configured");
      }

      const minimumBid =
        listing.currentBid === null
          ? listing.startingBid
          : listing.currentBid + listing.bidIncrement;

      if (!Number.isSafeInteger(minimumBid) || minimumBid > 2_147_483_647) {
        throw new AuctionRequestError(409, "Auction cannot accept a higher bid");
      }

      if (bidAmount < minimumBid) {
        throw new AuctionRequestError(
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
          currentBid: listing.currentBid,
          auctionEndsAt: listing.auctionEndsAt,
        },
        data: {
          currentBid: bidAmount,
          highestBidderId: currentUser.id,
          auctionEndsAt,
        },
      });

      if (claimedListing.count !== 1) {
        throw new AuctionRequestError(
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
    const notifications: Promise<unknown>[] = [
      pusherServer.trigger(`listing-${listingId}`, "new-bid", result.newBid),
    ];
    if (result.shouldExtend) {
      notifications.push(
        pusherServer.trigger(`listing-${listingId}`, "new-end-time", {
          newEndTime: result.auctionEndsAt,
        })
      );
    }
    const notificationResults = await Promise.allSettled(notifications);
    if (notificationResults.some((item) => item.status === "rejected")) {
      logger.warn("bid.notification_failed", { listingId });
    }

    return NextResponse.json(
      {
        bid: result.newBid,
        currentBid: result.newBid.amount,
        auctionEndsAt: result.auctionEndsAt,
      },
      { status: 201 }
    );
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("bid.place_failed", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
