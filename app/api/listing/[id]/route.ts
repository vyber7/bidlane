import { assertListingAssets } from "@/app/libs/uploaded-assets";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { parseListing } from "@/app/libs/listing-validation";
import { reviewRevisionSchema } from "@/app/schemas/listing-review";
import { pendingReviewUpdate, reviewVersionWhere } from "@/app/libs/listing-review";
import { logger } from "@/app/libs/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const id = requireListingId((await params).id);
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return errorResponse("Listing not found.", 404);
    if (listing.userId !== user.id) return errorResponse("Only the seller can edit this listing.", 403);
    if (listing.status !== "UPCOMING") return errorResponse("Listings cannot be edited after bidding opens.", 409);
    const body = await readJsonObject(request);
    const revision = parseApiInput(reviewRevisionSchema, body.revision);
    if (revision !== (listing.reviewRevision ?? 0)) return errorResponse("This listing changed. Reload before editing again.", 409);
    const data = parseListing(body.data);
    await assertListingAssets(user.id, data, { images: listing.images, vehicleRecords: listing.vehicleRecords, listingId: id });
    const coverImage = typeof body.coverImage === "string" && data.images.includes(body.coverImage) ? body.coverImage : data.images[0];
    const updated = await prisma.listing.updateMany({
      where: { id, userId: user.id, status: "UPCOMING", ...reviewVersionWhere(revision) },
      data: { ...data, vin: data.vin || null, coverImage, ...pendingReviewUpdate(revision) },
    });
    if (updated.count !== 1) return errorResponse("This listing changed. Reload before editing again.", 409);
    return Response.json({ saved: true, reviewRevision: revision + 1, reviewStatus: "PENDING" });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.edit_failed", error);
    return errorResponse("Could not save your listing. Please try again.", 500);
  }
}
