import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import {
  ApiRequestError,
  apiErrorResponse,
  errorResponse,
  readJsonObject,
} from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    const body = await readJsonObject(request);
    if (typeof body.outbidEmailsEnabled !== "boolean")
      throw new ApiRequestError(
        400,
        "Outbid email preference must be true or false",
      );
    const preferences = await prisma.user.update({
      where: { id: user.id },
      data: { outbidEmailsEnabled: body.outbidEmailsEnabled },
      select: { outbidEmailsEnabled: true },
    });
    return Response.json(preferences);
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("notification.preferences_failed", error);
    return errorResponse("Unable to save email preferences", 500);
  }
}
