import { Prisma } from "@prisma/client";
import prisma from "./prismadb";

async function takeQuota(key: string, limit: number, windowMs: number, now: number) {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
  let bucket;
  try {
    bucket = await prisma.uploadQuota.upsert({
      where: { id },
      create: { id, count: 1, expiresAt: new Date((window + 1) * windowMs) },
      update: { count: { increment: 1 } },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    bucket = await prisma.uploadQuota.update({ where: { id }, data: { count: { increment: 1 } } });
  }
  return bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000));
}

// Shared budgets cover attempts, including rejected files and provider errors.
// Global budgets bound cost even when an attacker rotates signed-in accounts.
export async function uploadRetryAfter(userId: string, now = Date.now()) {
  await prisma.uploadQuota.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  for (const [key, limit, windowMs] of [
    ["global:hour", 100, 3_600_000], ["global:day", 500, 86_400_000],
    [`user:${userId}:hour`, 40, 3_600_000], [`user:${userId}:day`, 100, 86_400_000],
  ] as const) {
    const retryAfter = await takeQuota(key, limit, windowMs, now);
    if (retryAfter) return retryAfter;
  }
  return 0;
}
