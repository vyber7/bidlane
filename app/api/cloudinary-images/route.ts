import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import { logger } from "@/app/libs/logger";
import { canViewListing } from "@/app/libs/listing-review";
import {
  ApiRequestError,
  apiErrorResponse,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";

export async function GET(req: Request) {
  const folder = new URL(req.url).searchParams.get("folder");

  try {
    const match = folder?.match(/^listing-([a-f\d]{24})$/i);
    if (!match) {
      throw new ApiRequestError(400, "Invalid listing image folder");
    }

    const listingId = requireListingId(match[1]);
    const listing = await getNativeRepositories().listingAuthoring.find(listingId);
    if (!listing) throw new ApiRequestError(404, "Listing not found");
    if (!canViewListing(listing, await getCurrentUser())) throw new ApiRequestError(404, "Listing not found");

    const images = listing.images.map((url) => ({ url }));
    return NextResponse.json({ images });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("cloudinary.images_route_failed", error, { folder });
    return errorResponse("Failed to fetch images", 500);
  }
}
