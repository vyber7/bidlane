import { getAdminOverview } from "@/app/libs/admin";
import { apiErrorResponse, errorResponse } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

export async function GET() {
  try {
    return Response.json(await getAdminOverview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("admin.overview_failed", error);
    return errorResponse("Unable to load administration overview", 500);
  }
}
