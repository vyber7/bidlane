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
    const data: { outbidEmailsEnabled?: boolean; endingSoonEmailsEnabled?: boolean } = {};
    for (const key of ["outbidEmailsEnabled", "endingSoonEmailsEnabled"] as const) {
      if (!(key in body)) continue;
      if (typeof body[key] !== "boolean")
        throw new ApiRequestError(400, "Email preferences must be true or false");
      data[key] = body[key];
    }
    if (!Object.keys(data).length)
      throw new ApiRequestError(400, "Provide an email preference");
    const preferences = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        ...(data.outbidEmailsEnabled !== undefined && { outbidEmailsEnabled: true }),
        ...(data.endingSoonEmailsEnabled !== undefined && { endingSoonEmailsEnabled: true }),
      },
    });
    return Response.json(preferences);
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("notification.preferences_failed", error);
    return errorResponse("Unable to save email preferences", 500);
  }
}
