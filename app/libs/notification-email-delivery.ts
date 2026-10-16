import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prismadb";
import { logger } from "./logger";
import {
  buildOutbidEmail,
  EmailProviderError,
  getEmailConfiguration,
  sendOutbidEmail,
  type OutbidEmailPayload,
} from "./outbid-email";

const MAX_ATTEMPTS = 8;
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;
const eligible = (now: Date): Prisma.NotificationWhereInput => ({
  OR: [
    { emailStatus: "PENDING", emailNextAttemptAt: { lte: now } },
    { emailStatus: "SENDING", emailLockedUntil: { lte: now } },
  ],
});

export async function sendNotificationEmails(batchSize = 20) {
  const config = getEmailConfiguration();
  if (!config) throw new Error("Email delivery is not configured");
  const startedAt = Date.now();
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 20);
  const candidates = await prisma.notification.findMany({
    where: eligible(new Date()),
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
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
    const claimed = await prisma.notification.updateMany({
      where: { id: candidate.id, ...eligible(now) },
      data: {
        emailStatus: "SENDING",
        emailLockToken: token,
        emailLockedUntil: new Date(now.getTime() + 120000),
        emailAttempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;
    summary.checked += 1;
    const where = {
      id: candidate.id,
      emailStatus: "SENDING" as const,
      emailLockToken: token,
    };
    const finish = (data: Prisma.NotificationUpdateManyMutationInput) =>
      prisma.notification.updateMany({
        where,
        data: { ...data, emailLockToken: null, emailLockedUntil: null },
      });
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: candidate.id },
        include: {
          user: { select: { email: true, outbidEmailsEnabled: true } },
        },
      });
      if (!notification || notification.emailLockToken !== token) continue;
      if (notification.emailAttempts > MAX_ATTEMPTS) {
        await finish({
          emailStatus: "FAILED",
          emailLastError: "attempts_exhausted",
        });
        summary.failed += 1;
        continue;
      }
      if (
        !notification.user?.email ||
        notification.user.outbidEmailsEnabled === false
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
      if (!payload) {
        const listing = notification.emailListingId
          ? await prisma.listing.findUnique({
              where: { id: notification.emailListingId },
              select: {
                id: true,
                year: true,
                make: true,
                model: true,
                status: true,
                auctionEndsAt: true,
                highestBidderId: true,
              },
            })
          : null;
        if (
          notification.readAt ||
          !listing ||
          listing.status !== "LIVE" ||
          !listing.auctionEndsAt ||
          listing.auctionEndsAt <= now ||
          listing.highestBidderId === notification.userId
        ) {
          await finish({
            emailStatus: "SKIPPED",
            emailLastError: "alert_no_longer_relevant",
          });
          summary.skipped += 1;
          continue;
        }
        payload = buildOutbidEmail({
          ...config,
          to: notification.user.email,
          vehicle: `${listing.year} ${listing.make} ${listing.model}`,
          listingId: listing.id,
        });
        // Freeze the recipient and content before HTTP. Retries must use the
        // same payload as well as the same provider idempotency key.
        const prepared = await prisma.notification.updateMany({
          where,
          data: { emailPayload: payload, emailFirstAttemptAt: now },
        });
        if (prepared.count !== 1) continue;
      }
      const providerId = await sendOutbidEmail(
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
      const current = await prisma.notification.findUnique({
        where: { id: candidate.id },
        select: { emailAttempts: true },
      });
      const attempts = current?.emailAttempts ?? MAX_ATTEMPTS;
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
