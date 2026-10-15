import { NextResponse } from "next/server";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { finalizeAuction } from "@/app/libs/auction-finalization";
import { logger } from "@/app/libs/logger";

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const finalization = await finalizeAuction(listingId);

    if (finalization.status === "not_found") {
      throw new ApiRequestError(404, "Listing not found");
    }
    if (finalization.status === "not_due") {
      throw new ApiRequestError(
        409,
        "Auction cannot end before its scheduled time"
      );
    }

    return NextResponse.json(finalization);
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("auction.finalize_failed", error);
    return errorResponse("Error finalizing auction", 500);
  }
}
