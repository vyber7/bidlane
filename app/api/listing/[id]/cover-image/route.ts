import { NextResponse } from "next/server";
import prisma from "../../../../libs/prismadb";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";
import { isCloudinaryImageUrl } from "@/app/libs/listing-validation";

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

    const coverImageUrl = body.url;
    if (!isCloudinaryImageUrl(coverImageUrl, listingId)) {
      throw new ApiRequestError(400, "Invalid cover image URL");
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true },
    });
    if (!listing) throw new ApiRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new ApiRequestError(403, "Only the seller can update this listing");
    }

    const updated = await prisma.listing.updateMany({
      where: { id: listingId, userId: currentUser.id },
      data: { coverImage: coverImageUrl },
    });
    if (updated.count !== 1) {
      throw new ApiRequestError(
        409,
        "Listing changed while updating the cover image"
      );
    }

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
