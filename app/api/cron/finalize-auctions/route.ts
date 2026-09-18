import { NextResponse } from "next/server";
import { finalizeExpiredAuctions } from "@/app/libs/auction-finalization";
import { logger } from "@/app/libs/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    req.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await finalizeExpiredAuctions();
    return NextResponse.json(summary, {
      status: summary.failed > 0 ? 500 : 200,
    });
  } catch (error) {
    logger.error("auction.finalization_batch_failed", error);
    return NextResponse.json(
      { error: "Error finalizing auctions" },
      { status: 500 }
    );
  }
}
