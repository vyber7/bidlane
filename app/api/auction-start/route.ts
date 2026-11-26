import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
  requireSafeInteger,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { startAuction, type StartRejection } from "@/app/libs/auction-commands";
import { z } from "@/app/schemas/zod";

const explicitEndTime = z.union([z.iso.datetime({ offset: true }), z.number()]);

const rejections = {
  "ends-in-past": [400, "End time must be in the future"],
  "ladder-too-large": [400, "Starting bid plus increment is too large"],
  "not-found": [404, "Listing not found"],
  "not-seller": [403, "Only the seller can start this auction"],
  "not-upcoming": [409, "Only an upcoming auction can be started"],
  "not-approved": [409, "This listing must be approved by an admin before the auction can start."],
  "already-started": [409, "Auction has already been started"],
  busy: [503, "The auction is busy. Please try again."],
} as const satisfies Record<StartRejection, readonly [number, string]>;

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
    const endTimeValue = explicitEndTime.safeParse(body.endTime);
    const endsAt = endTimeValue.success ? new Date(endTimeValue.data) : null;
    if (!endsAt || Number.isNaN(endsAt.getTime())) {
      throw new ApiRequestError(400, "Choose an end time with a time zone.");
    }

    const outcome = await startAuction({ sellerId: currentUser.id, listingId, startingBid, bidIncrement, endsAt });
    if (!outcome.ok) {
      const [status, message] = rejections[outcome.reason];
      return errorResponse(message, status);
    }

    return NextResponse.json(
      { message: "Auction started", auctionStartsAt: outcome.auctionStartsAt, auctionEndsAt: outcome.auctionEndsAt },
      { status: 201 }
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("auction.start_failed", error);
    return errorResponse("Failed to create auction", 500);
  }
}
