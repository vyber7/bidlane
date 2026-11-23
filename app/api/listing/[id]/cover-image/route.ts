import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { correctCoverImage } from "@/app/libs/seller-listing-corrections";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let listingId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return errorResponse("Unauthorized", 401);
    }

    const { id } = await context.params;
    listingId = requireListingId(id);
    const body = await readJsonObject(request);

    const { coverImageUrl } = await correctCoverImage({ listingId, sellerId: currentUser.id }, body.url);

    return NextResponse.json(
      {
        message: "Cover image updated successfully",
        coverImageUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.cover_image_failed", error, { listingId });
    return errorResponse("Failed to update cover image", 500);
  }
}
