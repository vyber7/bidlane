import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { correctVehicleRecords } from "@/app/libs/seller-listing-corrections";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const listingId = requireListingId((await params).id);
    await correctVehicleRecords({ listingId, sellerId: user.id }, () => readJsonObject(request));
    return Response.json({ saved: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("listing.vehicle_details_failed");
    return errorResponse("Could not save vehicle details. Please try again.", 500);
  }
}
