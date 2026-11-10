import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { auctionTransactionOptions } from "@/prisma/native/transaction-errors";
import { logger } from "./logger";
import { endingSoonNotifications, publishNotificationChanges, saveNotifications } from "./notifications";

export const ENDING_SOON_WINDOW_MS = 60 * 60 * 1000;
export async function queueEndingSoonReminders(now = new Date(), batchSize = 100) {
  const startedAt = Date.now();
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 100);
  const windowEnd = new Date(now.getTime() + ENDING_SOON_WINDOW_MS);
  const candidates = await getNativeRepositories().auctions.reminderCandidates(now, windowEnd, limit);
  const summary = { checked: 0, queued: 0, skipped: 0, failed: 0, hasMore: candidates.length === limit };
  for (const { id } of candidates) {
    if (Date.now() - startedAt >= 40000) {
      summary.hasMore = true;
      break;
    }
    summary.checked += 1;
    try {
      const users = await withNativeTransaction(async (tx) => {
        // Claim and persist together: a crash cannot lose or duplicate reminders.
        const listing = await tx.auctions.claimReminder(id, now, windowEnd);
        if (!listing) return null;
        return saveNotifications(tx, endingSoonNotifications(listing, now));
      }, auctionTransactionOptions);
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
