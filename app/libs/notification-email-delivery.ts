import { randomUUID } from "node:crypto";
import { getNativeRepositories } from "./native-repositories";
import type { NotificationEmailFinish } from "@/prisma/native/notification-emails";
import { logger } from "./logger";
import {
  buildOutbidEmail,
  EmailProviderError,
  getEmailConfiguration,
  sendOutbidEmail,
  sendEmail,
  type OutbidEmailPayload,
} from "./outbid-email";

const MAX_ATTEMPTS = 8;
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function sendNotificationEmails(batchSize = 20) {
  const config = getEmailConfiguration();
  if (!config) throw new Error("Email delivery is not configured");
  const startedAt = Date.now();
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 20);
  const { notificationEmails } = getNativeRepositories();
  const candidates = await notificationEmails.candidates(new Date(), limit);
  const summary = {
    checked: 0,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    hasMore: candidates.length === limit,
  };

  for (const candidate of candidates) {
    if (Date.now() - startedAt >= 40000) {
      summary.hasMore = true;
      break;
    }
    const token = randomUUID();
    const now = new Date();
    const claimed = await notificationEmails.claim(candidate.id, now, token);
    if (claimed.count !== 1) continue;
    summary.checked += 1;
    const finish = (data: NotificationEmailFinish) => notificationEmails.finish(candidate.id, token, data);
    try {
      const notification = await notificationEmails.find(candidate.id);
      if (!notification || notification.emailLockToken !== token) continue;
      if (notification.emailAttempts > MAX_ATTEMPTS) {
        await finish({
          emailStatus: "FAILED",
          emailLastError: "attempts_exhausted",
        });
        summary.failed += 1;
        continue;
      }
      const endingSoon = notification.eventKey.startsWith("ending-soon:");
      if (
        !notification.user?.email ||
        (endingSoon ? notification.user.endingSoonEmailsEnabled : notification.user.outbidEmailsEnabled) === false
      ) {
        await finish({
          emailStatus: "SKIPPED",
          emailLastError: "email_disabled_or_missing",
        });
        summary.skipped += 1;
        continue;
      }
      // A provider may have accepted a timed-out request. Never resend after
      // its deduplication window, even following a long scheduler outage.
      if (
        notification.emailFirstAttemptAt &&
        now.getTime() - notification.emailFirstAttemptAt.getTime() >=
          IDEMPOTENCY_WINDOW_MS
      ) {
        await finish({
          emailStatus: "FAILED",
          emailLastError: "idempotency_window_expired",
        });
        summary.failed += 1;
        continue;
      }
      let payload = notification.emailPayload as OutbidEmailPayload | null;
      if (payload && payload.to[0] !== notification.user.email) {
        await finish({
          emailStatus: "SKIPPED",
          emailLastError: "recipient_changed",
        });
        summary.skipped += 1;
        continue;
      }
      if (!payload || endingSoon) {
        const listing = notification.emailListingId
          ? await notificationEmails.listing(notification.emailListingId)
          : null;
        if (
          notification.readAt ||
          !listing ||
          listing.status !== "LIVE" ||
          !listing.auctionEndsAt ||
          listing.auctionEndsAt <= now ||
          (!endingSoon && listing.highestBidderId === notification.userId) ||
          (endingSoon && !listing.watchersIds.includes(notification.userId) && !listing.biddersIds.includes(notification.userId) && listing.highestBidderId !== notification.userId)
        ) {
          await finish({
            emailStatus: "SKIPPED",
            emailLastError: "alert_no_longer_relevant",
          });
          summary.skipped += 1;
          continue;
        }
        if (!payload) {
          payload = buildOutbidEmail({
            ...config,
            to: notification.user.email,
            vehicle: `${listing.year} ${listing.make} ${listing.model}`,
            listingId: listing.id,
            endingSoon,
          });
          // Freeze the recipient and content before HTTP. Retries must use the
          // same payload as well as the same provider idempotency key.
          const prepared = await notificationEmails.prepare(candidate.id, token, payload, now);
          if (prepared.count !== 1) continue;
        }
      }
      const providerId = endingSoon
        ? await sendEmail(config.apiKey, payload, `ending-soon/${notification.id}`)
        : await sendOutbidEmail(
            config.apiKey,
            payload,
            notification.id,
          );
      const completed = await finish({
        emailStatus: "SENT",
        emailSentAt: new Date(),
        emailProviderId: providerId,
        emailLastError: null,
      });
      if (completed.count === 1) summary.sent += 1;
    } catch (error) {
      if (!(error instanceof EmailProviderError)) {
        // A database failure after provider acceptance leaves the lease and
        // immutable payload intact for an idempotent recovery attempt.
        logger.warn("notification.email_processing_failed", {
          notificationId: candidate.id,
        });
        summary.failed += 1;
        continue;
      }
      const attempts = await notificationEmails.attempts(candidate.id) ?? MAX_ATTEMPTS;
      const retry = error.retryable && attempts < MAX_ATTEMPTS;
      const delay = Math.max(
        Math.min(60000 * 2 ** (attempts - 1), 1800000),
        error.retryAfterMs,
      );
      await finish({
        emailStatus: retry ? "PENDING" : "FAILED",
        emailLastError: error.code,
        emailNextAttemptAt: retry ? new Date(Date.now() + delay) : null,
      });
      if (retry) summary.retried += 1;
      else summary.failed += 1;
      if (error.stopBatch) {
        summary.hasMore = true;
        break;
      }
    }
  }
  return summary;
}
