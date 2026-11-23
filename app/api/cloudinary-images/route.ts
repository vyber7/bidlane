import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import { logger } from "@/app/libs/logger";
import { canViewListing } from "@/app/libs/listing-review";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { addGalleryPhoto } from "@/app/libs/seller-listing-corrections";

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

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const { alreadySaved, imageUrl } = await addGalleryPhoto({ listingId, sellerId: currentUser.id }, body.imageUrl);
    return NextResponse.json({
      message: alreadySaved ? "Image already saved" : "Image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("cloudinary.image_save_failed", error);
    return errorResponse("Failed to save image", 500);
  }
}
