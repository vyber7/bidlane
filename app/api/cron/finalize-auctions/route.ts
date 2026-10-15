import { NextResponse } from "next/server";
import { finalizeExpiredAuctions } from "@/app/libs/auction-finalization";
import { logger } from "@/app/libs/logger";
import { errorResponse } from "@/app/libs/api-request";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    req.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const summary = await finalizeExpiredAuctions();
    if (summary.failed > 0) {
      return NextResponse.json({ ...summary, error: "Some auctions could not be finalized" }, { status: 500 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    logger.error("auction.finalization_batch_failed", error);
    return errorResponse("Error finalizing auctions", 500);
  }
}
