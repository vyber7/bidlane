import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { ApiRequestError } from "./api-request";
import { getEmailConfiguration } from "./outbid-email";
import { normalizeEmail } from "@/app/utils/email";

export const RESET_REQUEST_MESSAGE = "If an eligible account exists, you’ll receive a password reset email shortly. If you use Google or GitHub, continue with that sign-in method.";
export const resetHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function resetToken(id: string, nonce: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Recovery is not configured");
  // The queue can derive the token using the server secret without storing
  // a plaintext recovery link. A database-only leak cannot reconstruct it.
  return createHmac("sha256", secret).update(`bidlane:password-reset:${id}:${nonce}`).digest("hex");
}

async function withinQuota(key: string, limit: number, windowMs: number, now: number, mode: "check" | "consume" = "consume") {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
  if (mode === "check") {
    const bucket = await getNativeRepositories().quotas.passwordReset.read(id);
    return !bucket || bucket.count < limit;
  }
  const bucket = await getNativeRepositories().quotas.passwordReset.consume(id, new Date((window + 1) * windowMs));
  return bucket.count <= limit;
}

export async function requestPasswordReset(email: string) {
  email = normalizeEmail(email);
  if (!getEmailConfiguration() || !process.env.NEXTAUTH_SECRET) {
    throw new ApiRequestError(503, "Password recovery is temporarily unavailable. Please try again later.");
  }
  const now = new Date();
  const id = resetHash(email);
  await getNativeRepositories().quotas.passwordReset.deleteExpired(now);
  // Do not allocate new address buckets after global exhaustion. The final
  // atomic consume below still prevents races from exceeding the shared cap.
  if (!await withinQuota("global", 30, 60_000, now.getTime(), "check")) return;
  if (!await withinQuota(`email:${id}`, 3, 15 * 60_000, now.getTime())) return;
  if (!await withinQuota("global", 30, 60_000, now.getTime())) return;
  const nonce = randomBytes(32).toString("hex");
  const data = {
    email, nonce, tokenHash: resetHash(resetToken(id, nonce)), requestedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60_000), userId: null, sessionVersion: null, usedAt: null,
  };
  // Identical work for known, unknown, and connected-only accounts. Account
  // lookup and provider latency occur in the scheduled delivery worker.
  await withNativeTransaction(async (tx) => {
    await tx.passwordResets.replace({ id, ...data });
    await tx.recoveryEmails.enqueue({ id: randomUUID(), email, kind: "RESET", resetId: id, nonce, nextAttemptAt: now });
  });
}

const invalidLink = () => new ApiRequestError(400, "This reset link is invalid, expired, or already used. Request a new one.");

export async function resetPassword(token: string, password: string) {
  const tokenHash = resetHash(token);
  const record = await getNativeRepositories().passwordResets.findByTokenHash(tokenHash);
  if (!record || !record.userId || record.usedAt || record.expiresAt <= new Date()) throw invalidLink();
  // Reject invalid links before performing expensive password hashing.
  const hashedPassword = await bcrypt.hash(password, 12);
  await withNativeTransaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.passwordResets.claim({ id: record.id, tokenHash, nonce: record.nonce }, now);
    if (claimed.count !== 1) throw invalidLink();
    const user = await tx.recoveryUsers.find(record.userId!);
    if (!user?.hashedPassword || !user.email || normalizeEmail(user.email) !== normalizeEmail(record.email) || (user.sessionVersion ?? "") !== (record.sessionVersion ?? "")) throw invalidLink();
    const updated = await tx.recoveryUsers.updatePassword(
      { id: user.id, email: user.email, hashedPassword: user.hashedPassword },
      { hashedPassword, sessionVersion: randomBytes(32).toString("hex") }, now,
    );
    if (updated.count !== 1) throw invalidLink();
    await tx.recoveryEmails.enqueue({ id: randomUUID(), email: user.email, kind: "CHANGED", nextAttemptAt: now });
  });
}
