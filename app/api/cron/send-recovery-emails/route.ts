import { sendRecoveryEmails } from "@/app/libs/recovery-email-delivery";
import { getEmailConfiguration } from "@/app/libs/outbid-email";
import { errorResponse } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return errorResponse("Unauthorized", 401);
  if (!getEmailConfiguration() || !process.env.NEXTAUTH_SECRET) return errorResponse("Recovery email delivery is not configured", 503);
  try {
    const summary = await sendRecoveryEmails();
    return Response.json(summary, { status: summary.failed ? 500 : 200 });
  } catch {
    logger.warn("recovery.email_batch_failed");
    return errorResponse("Unable to process recovery emails", 500);
  }
}
