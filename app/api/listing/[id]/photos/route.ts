import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { correctListing } from "@/app/libs/listing-correction";

/** Adds one uploaded photo to the Listing's gallery as a Correction. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let listingId: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    listingId = requireListingId((await params).id);
    const { imageUrl } = await readJsonObject(request);
    const { changed } = await correctListing({ listingId, sellerId: user.id }, { kind: "galleryPhoto", url: imageUrl });
    return Response.json({ message: changed ? "Image uploaded successfully" : "Image already saved", imageUrl });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.photo_save_failed", error, { listingId });
    return errorResponse("Failed to save image", 500);
  }
}
