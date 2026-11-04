import { requireAdmin } from "@/app/libs/admin";
import { reviewListing } from "@/app/libs/listing-moderation";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { listingDecisionSchema } from "@/app/schemas/listing-review";
import { logger } from "@/app/libs/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const id = requireListingId((await params).id);
    const input = parseApiInput(listingDecisionSchema, await readJsonObject(request));
    return Response.json(await reviewListing(id, input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return errorResponse("This listing changed. Reload and review the latest version.", 409);
    }
    logger.error("listing.review_failed", error);
    return errorResponse("Could not save this review. Please try again.", 500);
  }
}
