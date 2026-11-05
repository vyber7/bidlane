import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "./prismadb";
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
    const bucket = await prisma.passwordResetQuota.findUnique({ where: { id } });
    return !bucket || bucket.count < limit;
  }
  let bucket;
  try {
    bucket = await prisma.passwordResetQuota.upsert({
      where: { id }, create: { id, count: 1, expiresAt: new Date((window + 1) * windowMs) },
      update: { count: { increment: 1 } },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    bucket = await prisma.passwordResetQuota.update({ where: { id }, data: { count: { increment: 1 } } });
  }
  return bucket.count <= limit;
}

export async function requestPasswordReset(email: string) {
  email = normalizeEmail(email);
  if (!getEmailConfiguration() || !process.env.NEXTAUTH_SECRET) {
    throw new ApiRequestError(503, "Password recovery is temporarily unavailable. Please try again later.");
  }
  const now = new Date();
  const id = resetHash(email);
  await prisma.passwordResetQuota.deleteMany({ where: { expiresAt: { lte: now } } });
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
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.upsert({ where: { id }, create: { id, ...data }, update: data });
    await tx.recoveryEmail.create({ data: { id: randomUUID(), email, kind: "RESET", resetId: id, nonce, nextAttemptAt: now } });
  });
}

const invalidLink = () => new ApiRequestError(400, "This reset link is invalid, expired, or already used. Request a new one.");

export async function resetPassword(token: string, password: string) {
  const tokenHash = resetHash(token);
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!record || !record.userId || record.usedAt || record.expiresAt <= new Date()) throw invalidLink();
  // Reject invalid links before performing expensive password hashing.
  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.passwordReset.updateMany({
      where: { id: record.id, tokenHash, nonce: record.nonce, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw invalidLink();
    const user = await tx.user.findUnique({ where: { id: record.userId! }, select: { id: true, email: true, hashedPassword: true, sessionVersion: true } });
    if (!user?.hashedPassword || !user.email || normalizeEmail(user.email) !== normalizeEmail(record.email) || (user.sessionVersion ?? "") !== (record.sessionVersion ?? "")) throw invalidLink();
    const updated = await tx.user.updateMany({
      where: { id: user.id, email: user.email, hashedPassword: user.hashedPassword },
      data: { hashedPassword, sessionVersion: randomBytes(32).toString("hex") },
    });
    if (updated.count !== 1) throw invalidLink();
    await tx.recoveryEmail.create({ data: { id: randomUUID(), email: user.email, kind: "CHANGED", nextAttemptAt: now } });
  });
}
