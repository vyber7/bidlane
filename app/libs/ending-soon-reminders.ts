import type { Prisma } from "@prisma/client";
import prisma from "./prismadb";
import { logger } from "./logger";
import { endingSoonNotifications, publishNotificationChanges, saveNotifications } from "./notifications";

export const ENDING_SOON_WINDOW_MS = 60 * 60 * 1000;
const unreminded: Prisma.ListingWhereInput = {
  OR: [{ endingSoonReminderAt: null }, { endingSoonReminderAt: { isSet: false } }],
};

export async function queueEndingSoonReminders(now = new Date(), batchSize = 100) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 100);
  const due: Prisma.ListingWhereInput = {
    ...unreminded,
    status: "LIVE",
    auctionEndsAt: { gt: now, lte: new Date(now.getTime() + ENDING_SOON_WINDOW_MS) },
  };
  const candidates = await prisma.listing.findMany({
    where: due,
    orderBy: { auctionEndsAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const summary = { checked: 0, queued: 0, skipped: 0, failed: 0, hasMore: candidates.length === limit };
  for (const { id } of candidates) {
    if (Date.now() - startedAt >= 40000) {
      summary.hasMore = true;
      break;
    }
    summary.checked += 1;
    try {
      const users = await prisma.$transaction(async (tx) => {
        // Claim and persist together: a crash cannot lose or duplicate reminders.
        const claimed = await tx.listing.updateMany({
          where: { id, ...due },
          data: { endingSoonReminderAt: now },
        });
        if (claimed.count !== 1) return null;
        const listing = await tx.listing.findUniqueOrThrow({ where: { id } });
        return saveNotifications(tx, endingSoonNotifications(listing, now));
      });
      if (users === null) summary.skipped += 1;
      else {
        summary.queued += 1;
        await publishNotificationChanges(users);
      }
    } catch (error) {
      summary.failed += 1;
      logger.error("auction.reminder_failed", error, { listingId: id });
    }
  }
  return summary;
}
