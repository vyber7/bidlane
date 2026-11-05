import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prismadb";

async function quotaRetryAfter(key: string, limit: number, windowMs: number, now: number, mode: "check" | "consume" = "consume") {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
  if (mode === "check") {
    const bucket = await prisma.contactRateLimit.findUnique({ where: { id } });
    return bucket && bucket.count >= limit ? Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000)) : 0;
  }
  let bucket;
  try {
    bucket = await prisma.contactRateLimit.upsert({
      where: { id },
      create: { id, count: 1, expiresAt: new Date((window + 1) * windowMs) },
      update: { count: { increment: 1 } },
    });
  } catch (error) {
    // Concurrent first requests can both attempt to create the same bucket.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    bucket = await prisma.contactRateLimit.update({
      where: { id }, data: { count: { increment: 1 } },
    });
  }
  return bucket.count <= limit ? 0 : Math.ceil((bucket.expiresAt.getTime() - now) / 1000);
}

export async function contactRetryAfter(email: string, now = Date.now()) {
  await prisma.contactRateLimit.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  // A global budget also limits senders who rotate email addresses. Do not trust
  // arbitrary forwarding headers as a source of client identity.
  // Reject an exhausted global budget without allocating sender buckets;
  // the later atomic increment still arbitrates concurrent admissions.
  const globalWait = await quotaRetryAfter("global", 30, 60_000, now, "check");
  if (globalWait) return globalWait;
  const emailHash = createHash("sha256").update(email.toLowerCase()).digest("hex");
  const emailWait = await quotaRetryAfter(`email:${emailHash}`, 3, 15 * 60_000, now);
  if (emailWait) return emailWait;
  return quotaRetryAfter("global", 30, 60_000, now);
}
