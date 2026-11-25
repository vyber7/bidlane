import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { correctListing } from "@/app/libs/listing-correction";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const listingId = requireListingId((await params).id);
    const { vin, vehicleRecords } = await readJsonObject(request);
    await correctListing({ listingId, sellerId: user.id }, { kind: "records", vin, vehicleRecords });
    return Response.json({ saved: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("listing.vehicle_details_failed");
    return errorResponse("Could not save vehicle details. Please try again.", 500);
  }
}
