import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { finalizeAuction } from "@/app/libs/auction-finalization";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser.email) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });

    if (!listing) throw new ApiRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new ApiRequestError(403, "Only the seller can end this auction");
    }
    if (listing.status === "ENDED") {
      return NextResponse.json({
        message: "Auction ended successfully",
        result: listing.result,
      });
    }
    if (listing.status !== "LIVE" || !listing.auctionEndsAt) {
      throw new ApiRequestError(409, "Auction is not live");
    }
    const endRequestTime = new Date();
    if (listing.auctionEndsAt > endRequestTime) {
      throw new ApiRequestError(409, "Auction cannot end before its scheduled time");
    }

    const finalization = await finalizeAuction(listingId, endRequestTime);
    if (finalization.status === "not_found") {
      throw new ApiRequestError(404, "Listing not found");
    }
    if (finalization.status === "not_due") {
      throw new ApiRequestError(409, "Auction cannot end before its scheduled time");
    }

    return NextResponse.json({
      message: "Auction ended successfully",
      result: finalization.result,
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("auction.end_failed", error);
    return errorResponse("Error ending auction", 500);
  }
}
