import { NextResponse } from "next/server";
import { withNativeTransaction } from "@/app/libs/native-repositories";
import { auctionTransactionOptions, isDuplicateKey, isTransactionContention } from "@/prisma/native/transaction-errors";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { pusherServer } from "@/app/libs/pusher";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  parseApiInput,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { outbidNotifications, publishNotificationChanges, saveNotifications } from "@/app/libs/notifications";
import type { AcceptedBidResponse, AuctionEndTimeEvent } from "@/app/types/auction-events";
import { bidIdempotencyKeySchema, bidRequestSchema } from "@/app/schemas/auction";
import { enforceAbuseLimit } from "@/app/libs/abuse-limits";
import { requireVerifiedEmail } from "@/app/libs/verified-email";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const { listingId, bidAmount } = parseApiInput(bidRequestSchema, await readJsonObject(req, 4096));
    const key = parseApiInput(bidIdempotencyKeySchema, req.headers.get("Idempotency-Key"));

    // Keep quota writes outside the bid transaction so rejected bids count.
    // Cache only this request's check across transaction retries.
    let permission: Promise<void> | undefined;
    const authorizeNewBid = () => permission ??= (async () => {
      requireVerifiedEmail(currentUser, "bid");
      await enforceAbuseLimit("bid", currentUser.id);
    })();

    const placeBid = () => withNativeTransaction(async (tx) => {
      const previous = await tx.bidSubmissions.find(currentUser.id, key);
      if (previous) {
        if (previous.listingId !== listingId || previous.amount !== bidAmount) {
          throw new ApiRequestError(409, "Idempotency-Key was already used for a different bid");
        }
        return { replayed: true as const, response: previous.response };
      }
      // Accepted replays acknowledge history without placing another bid.
      await authorizeNewBid();
      const bidTime = new Date();
      const listing = await tx.auctions.find(listingId);

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
      const claimedListing = await tx.auctions.claimBid(listing, { amount: bidAmount, userId: currentUser.id, auctionEndsAt }, bidTime);

      if (claimedListing.count !== 1) {
        throw new ApiRequestError(
          409,
          "The auction changed while placing this bid; please try again"
        );
      }

      const newBid = await tx.auctions.createBid({ amount: bidAmount, createdAt: bidTime, listingId, userId: currentUser.id });

      const notificationUsers = await saveNotifications(tx, outbidNotifications(listing, newBid));
      const response = {
        bid: { ...newBid, createdAt: newBid.createdAt.toISOString() },
        currentBid: newBid.amount,
        auctionEndsAt: auctionEndsAt.toISOString(),
      } satisfies AcceptedBidResponse;
      await tx.bidSubmissions.create({ userId: currentUser.id, key, listingId, amount: bidAmount, response }, bidTime);
      return { replayed: false as const, response, shouldExtend, notificationUsers };
    }, auctionTransactionOptions);

    // The driver retries transient conflicts within a bounded native session.
    // Duplicate request-key races need a new transaction to read the winner;
    // the unique index remains the final guard. Never retry an unknown commit.
    let result: Awaited<ReturnType<typeof placeBid>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await placeBid();
        break;
      } catch (error) {
        if (isTransactionContention(error)) return errorResponse("Bidding is busy; retry this same request", 503);
        if (!isDuplicateKey(error)) throw error;
        if (attempt === 2) {
          return errorResponse("Bidding is busy; retry this same request", 503);
        }
      }
    }
    if (!result) throw new Error("Bid transaction did not complete");
    if (result.replayed) return NextResponse.json(result.response, { status: 201 });

    // Publishing is best effort after commit. Replays never publish again.
    const { response, notificationUsers, shouldExtend } = result;
    const { bid } = response;
    const notifications: Promise<unknown>[] = [
      Promise.resolve().then(() => pusherServer.trigger(`listing-${listingId}`, "new-bid", bid)),
      Promise.resolve().then(() => publishNotificationChanges(notificationUsers)),
    ];
    if (shouldExtend) {
      notifications.push(
        Promise.resolve().then(() => pusherServer.trigger(`listing-${listingId}`, "new-end-time", {
          newEndTime: response.auctionEndsAt,
        } satisfies AuctionEndTimeEvent))
      );
    }
    const notificationResults = await Promise.allSettled(notifications);
    if (notificationResults.some((item) => item.status === "rejected")) {
      logger.warn("bid.notification_failed", { listingId });
    }

    return NextResponse.json(result.response, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("bid.place_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
