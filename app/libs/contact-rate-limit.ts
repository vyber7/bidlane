import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prismadb";

async function takeQuota(key: string, limit: number, windowMs: number, now: number) {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
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
  const globalWait = await takeQuota("global", 30, 60_000, now);
  if (globalWait) return globalWait;
  const emailHash = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return takeQuota(`email:${emailHash}`, 3, 15 * 60_000, now);
}
