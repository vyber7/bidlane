import { assertOwnedAssets } from "@/app/libs/uploaded-assets";
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
import {
  isCloudinaryImageUrl,
  MAX_LISTING_PHOTOS,
} from "@/app/libs/listing-validation";

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
    const imageUrl = body.imageUrl;
    if (!isCloudinaryImageUrl(imageUrl)) {
      throw new ApiRequestError(400, "Invalid listing image URL");
    }

    const listing = await getNativeRepositories().listingAuthoring.find(listingId);
    if (!listing) throw new ApiRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new ApiRequestError(403, "Only the seller can update this listing");
    }
    if (listing.status !== "UPCOMING") throw new ApiRequestError(409, "Photos cannot be changed after bidding opens.");
    if (listing.images.includes(imageUrl)) {
      return NextResponse.json({ message: "Image already saved", imageUrl });
    }
    if (listing.images.length >= MAX_LISTING_PHOTOS) {
      throw new ApiRequestError(
        409,
        "This listing already has the maximum number of images"
      );
    }

    await assertOwnedAssets({ userId: currentUser.id, kind: "PHOTO", urls: [imageUrl], listingId });
    const updated = await getNativeRepositories().listingAuthoring.addPhoto(listingId, currentUser.id, listing.reviewRevision ?? 0, listing.images, imageUrl, new Date());
    if (updated.count !== 1) {
      throw new ApiRequestError(
        409,
        "Listing images changed; please try again"
      );
    }

    return NextResponse.json({
      message: "Image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("cloudinary.image_save_failed", error);
    return errorResponse("Failed to save image", 500);
  }
}
