import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse } from "@/app/libs/api-request";
import { requestEmailVerification } from "@/app/libs/email-verification";
import { logger } from "@/app/libs/logger";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in to verify your email.", 401);
    return Response.json(await requestEmailVerification(user));
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("email_verification.request_failed");
    return errorResponse("We couldn’t send your verification email. Please try again in a minute.", 503);
  }
}
