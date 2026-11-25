import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { correctListing } from "@/app/libs/listing-correction";

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
    const { url } = await readJsonObject(request);
    await correctListing({ listingId, sellerId: currentUser.id }, { kind: "coverPhoto", url });

    return NextResponse.json(
      {
        message: "Cover image updated successfully",
        coverImageUrl: url,
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
