import { queueEndingSoonReminders } from "@/app/libs/ending-soon-reminders";
import { errorResponse } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return errorResponse("Unauthorized", 401);
  try {
    const summary = await queueEndingSoonReminders();
    return Response.json(
      summary.failed
        ? { ...summary, error: "Some reminders could not be queued" }
        : summary,
      { status: summary.failed ? 500 : 200 },
    );
  } catch (error) {
    logger.error("auction.reminder_batch_failed", error);
    return errorResponse("Unable to queue auction reminders", 500);
  }
}
