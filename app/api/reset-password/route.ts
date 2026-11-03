import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { resetPassword } from "@/app/libs/password-reset";
import { passwordResetSchema } from "@/app/schemas/password-reset";
import { logger } from "@/app/libs/logger";
export async function POST(request: Request) {
  try {
    const { token, password } = parseApiInput(passwordResetSchema, await readJsonObject(request));
    await resetPassword(token, password);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("password_reset.confirm_failed");
    return errorResponse("Could not reset your password. Please try again.", 503);
  }
}
