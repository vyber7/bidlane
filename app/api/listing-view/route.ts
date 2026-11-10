import { getNativeRepositories, withNativeTransaction } from "@/app/libs/native-repositories";
import { engagementTransactionOptions, isTransactionContention } from "@/prisma/native/transaction-errors";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { canViewListing } from "@/app/libs/listing-review";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const currentUser = await getCurrentUser();

    if (!currentUser?.id) {
      const listing = await getNativeRepositories().engagement.find(listingId);
      if (!listing) throw new ApiRequestError(404, "Listing not found");
      if (!canViewListing(listing, currentUser)) throw new ApiRequestError(404, "Listing not found");
      return NextResponse.json({ views: listing.views });
    }

    const views = await withNativeTransaction(async (tx) => {
      const listing = await tx.engagement.find(listingId);
      if (!listing) throw new ApiRequestError(404, "Listing not found");
      if (!canViewListing(listing, currentUser)) throw new ApiRequestError(404, "Listing not found");

      const now = new Date();
      const counted = await tx.engagement.claimView(listingId, currentUser.id, now);
      if (counted === null) return listing.views;
      await tx.engagement.recordSeen(currentUser.id, listingId, now);
      return counted;
    }, engagementTransactionOptions);

    return NextResponse.json({ views });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (isTransactionContention(error)) return errorResponse("The listing is busy. Please try again.", 503);
    logger.error("listing.view_failed", error);
    return errorResponse("Unable to record view", 500);
  }
}
