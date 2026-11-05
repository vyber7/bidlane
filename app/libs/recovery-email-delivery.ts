import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "./prismadb";
import { EmailProviderError, getEmailConfiguration, sendEmail } from "./outbid-email";
import { resetHash, resetToken } from "./password-reset";
import { logger } from "./logger";
import { emailIdentityFilter } from "./email-identity";

const eligible = (now: Date): Prisma.RecoveryEmailWhereInput => ({ OR: [
  { status: "PENDING", nextAttemptAt: { lte: now } },
  { status: "SENDING", lockedUntil: { lte: now } },
] });

export async function sendRecoveryEmails(batchSize = 20) {
  const config = getEmailConfiguration();
  if (!config || !process.env.NEXTAUTH_SECRET) throw new Error("Recovery email delivery is not configured");
  const startedAt = Date.now();
  await prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date(startedAt - 86400_000) } } });
  await prisma.recoveryEmail.deleteMany({ where: { status: { in: ["SENT", "SKIPPED", "FAILED"] }, createdAt: { lt: new Date(startedAt - 30 * 86400_000) } } });
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 20);
  const jobs = await prisma.recoveryEmail.findMany({ where: eligible(new Date()), orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  const summary = { checked: 0, sent: 0, skipped: 0, retried: 0, failed: 0, hasMore: jobs.length === limit };
  for (const candidate of jobs) {
    if (Date.now() - startedAt >= 40_000) { summary.hasMore = true; break; }
    const now = new Date();
    const lockToken = randomUUID();
    const claimed = await prisma.recoveryEmail.updateMany({
      where: { id: candidate.id, ...eligible(now) },
      data: { status: "SENDING", lockToken, lockedUntil: new Date(now.getTime() + 120_000), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    summary.checked++;
    const finish = (data: Prisma.RecoveryEmailUpdateManyMutationInput) => prisma.recoveryEmail.updateMany({
      where: { id: candidate.id, status: "SENDING", lockToken },
      data: { ...data, lockedUntil: null, lockToken: null },
    });
    try {
      const job = await prisma.recoveryEmail.findUnique({ where: { id: candidate.id } });
      if (!job || job.lockToken !== lockToken) continue;
      if (job.attempts > 5 || now.getTime() - job.createdAt.getTime() >= 23 * 3600_000) {
        await finish({ status: "FAILED" }); summary.failed++; continue;
      }
      let to = job.email;
      let subject: string;
      let text: string;
      let html: string;
      if (job.kind === "RESET") {
        const record = job.resetId ? await prisma.passwordReset.findUnique({ where: { id: job.resetId } }) : null;
        if (!record || record.nonce !== job.nonce || record.usedAt || record.expiresAt <= now) {
          await finish({ status: "SKIPPED" }); summary.skipped++; continue;
        }
        // Match case-insensitively, but never choose between two legacy accounts
        // with case-colliding addresses. Connected-only accounts get no reset.
        const users = await prisma.user.findMany({
          where: { email: emailIdentityFilter(job.email) }, take: 2,
          select: { id: true, email: true, hashedPassword: true, sessionVersion: true },
        });
        const user = users.length === 1 ? users[0] : null;
        if (!user?.hashedPassword || !user.email || (record.userId && (record.userId !== user.id || (record.sessionVersion ?? "") !== (user.sessionVersion ?? "")))) {
          await finish({ status: "SKIPPED" }); summary.skipped++; continue;
        }
        const token = resetToken(record.id, record.nonce);
        if (resetHash(token) !== record.tokenHash) { await finish({ status: "SKIPPED" }); summary.skipped++; continue; }
        const bound = await prisma.passwordReset.updateMany({
          where: { id: record.id, nonce: record.nonce, usedAt: null, expiresAt: { gt: now } },
          data: { userId: user.id, sessionVersion: user.sessionVersion ?? "" },
        });
        if (bound.count !== 1) { await finish({ status: "SKIPPED" }); summary.skipped++; continue; }
        to = user.email;
        const url = new URL("/reset-password", config.origin);
        url.hash = `token=${token}`;
        subject = "Reset your BidLane password";
        text = `Reset your BidLane password:\n\n${url.href}\n\nThis link expires 30 minutes after your request and can be used once. If you didn’t request this, ignore this email. Your password has not changed.`;
        html = `<p>Reset your BidLane password.</p><p><a href="${url.href}">Choose a new password</a></p><p>This link expires 30 minutes after your request and can be used once. If you didn’t request this, ignore this email. Your password has not changed.</p>`;
      } else if (job.kind === "CHANGED") {
        subject = "Your BidLane password was changed";
        text = "Your BidLane password was changed and existing sessions were signed out. If you did not make this change, request a new password reset and contact support@bidlane.net immediately.";
        html = `<p>${text}</p>`;
      } else { await finish({ status: "SKIPPED" }); summary.skipped++; continue; }
      const payload = { from: config.from, to: [to], subject, text, html };
      await sendEmail(config.apiKey, payload, `recovery/${job.id}/${resetHash(JSON.stringify(payload))}`);
      await finish({ status: "SENT" }); summary.sent++;
    } catch (error) {
      const retryable = !(error instanceof EmailProviderError) || error.retryable;
      const delay = error instanceof EmailProviderError ? Math.max(30_000, error.retryAfterMs) : 60_000;
      await finish({ status: retryable ? "PENDING" : "FAILED", nextAttemptAt: new Date(Date.now() + delay) });
      if (retryable) summary.retried++; else summary.failed++;
      logger.warn("recovery.email_attempt_failed");
      if (error instanceof EmailProviderError && error.stopBatch) { summary.hasMore = true; break; }
    }
  }
  return summary;
}
