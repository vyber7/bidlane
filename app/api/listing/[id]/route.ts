import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { correctListing } from "@/app/libs/listing-correction";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const listingId = requireListingId((await params).id);
    const { revision, data, coverImage } = await readJsonObject(request);
    const { reviewStatus, reviewRevision } = await correctListing(
      { listingId, sellerId: user.id },
      { kind: "details", revision, data, coverImage },
    );
    return Response.json({ saved: true, reviewStatus, reviewRevision });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.edit_failed", error);
    return errorResponse("Could not save your listing. Please try again.", 500);
  }
}
