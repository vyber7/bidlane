import { z } from "zod";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { confirmEmailVerification } from "@/app/libs/email-verification";
import { logger } from "@/app/libs/logger";

const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid verification link.") });
export async function POST(request: Request) {
  try {
    const { token } = parseApiInput(schema, await readJsonObject(request));
    await confirmEmailVerification(token);
    return Response.json({ verified: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("email_verification.confirm_failed");
    return errorResponse("We couldn’t verify your email. Please try again.", 503);
  }
}
