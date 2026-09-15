import { NextResponse } from "next/server";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
} from "@/app/api/auction-security";
import { finalizeAuction } from "@/app/libs/auction-finalization";
import { logger } from "@/app/libs/logger";

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const finalization = await finalizeAuction(listingId);

    if (finalization.status === "not_found") {
      throw new AuctionRequestError(404, "Listing not found");
    }
    if (finalization.status === "not_due") {
      throw new AuctionRequestError(
        409,
        "Auction cannot end before its scheduled time"
      );
    }

    return NextResponse.json(finalization);
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("auction.finalize_failed", error);
    return NextResponse.json(
      { error: "Error finalizing auction" },
      { status: 500 }
    );
  }
}
