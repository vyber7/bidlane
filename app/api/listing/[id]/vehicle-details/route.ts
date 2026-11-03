import { z } from "zod";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { listingIdSchema } from "@/app/schemas/common";
import { vinSchema, vehicleRecordsSchema } from "@/app/schemas/vehicle-trust";
import { logger } from "@/app/libs/logger";
const schema = z.object({ vin: vinSchema, vehicleRecords: vehicleRecordsSchema });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const id = parseApiInput(listingIdSchema, (await params).id);
    const listing = await prisma.listing.findUnique({ where: { id }, select: { userId: true, year: true, status: true } });
    if (!listing) return errorResponse("Listing not found.", 404);
    if (listing.userId !== user.id) return errorResponse("Only the seller can edit these details.", 403);
    if (listing.status !== "UPCOMING") return errorResponse("VIN and records can only be changed before bidding opens.", 409);
    const data = parseApiInput(schema, await readJsonObject(request));
    const updated = await prisma.listing.updateMany({
      where: { id, userId: user.id, status: "UPCOMING" },
      data: { vin: data.vin || null, vehicleRecords: data.vehicleRecords },
    });
    if (!updated.count) return errorResponse("The auction changed. Refresh before editing.", 409);
    return Response.json({ saved: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("listing.vehicle_details_failed");
    return errorResponse("Could not save vehicle details. Please try again.", 500);
  }
}
