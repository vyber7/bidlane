import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { requestPasswordReset, RESET_REQUEST_MESSAGE } from "@/app/libs/password-reset";
import { passwordResetRequestSchema } from "@/app/schemas/password-reset";
import { logger } from "@/app/libs/logger";
export async function POST(request: Request) {
  try {
    const { email } = parseApiInput(passwordResetRequestSchema, await readJsonObject(request));
    await requestPasswordReset(email);
    return Response.json({ message: RESET_REQUEST_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("password_reset.request_failed");
    return errorResponse("Password recovery is temporarily unavailable. Please try again later.", 503);
  }
}
