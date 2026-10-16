import { sendNotificationEmails } from "@/app/libs/notification-email-delivery";
import { getEmailConfiguration } from "@/app/libs/outbid-email";
import { errorResponse } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return errorResponse("Unauthorized", 401);
  if (!getEmailConfiguration()) return errorResponse("Email delivery is not configured", 503);
  try {
    const summary = await sendNotificationEmails();
    return Response.json(summary.failed ? { ...summary, error: "Some notification emails could not be processed" } : summary, { status: summary.failed ? 500 : 200 });
  } catch (error) {
    logger.warn("notification.email_batch_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return errorResponse("Unable to process notification emails", 500);
  }
}
