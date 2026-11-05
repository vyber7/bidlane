import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "./prismadb";
import { ApiRequestError } from "./api-request";

const minute = 60_000, hour = 60 * minute;
export const abusePolicies = {
  login: { global: [[100, minute], [1000, hour]], subject: [[10, 15 * minute]] },
  registration: { global: [[10, minute], [100, hour]], subject: [[3, hour]] },
  bid: { global: [[600, minute]], subject: [[30, minute]] },
  comment: { global: [[120, minute]], subject: [[5, minute], [30, hour]] },
} as const;
export type AbuseAction = keyof typeof abusePolicies;

async function consume(key: string, limit: number, windowMs: number, now: number) {
  const end = (Math.floor(now / windowMs) + 1) * windowMs;
  const id = `${key}:${end}`;
  let bucket;
  try {
    bucket = await prisma.abuseQuota.upsert({ where: { id }, create: { id, count: 1, expiresAt: new Date(end) }, update: { count: { increment: 1 } } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    bucket = await prisma.abuseQuota.update({ where: { id }, data: { count: { increment: 1 } } });
  }
  if (bucket.count > limit) throw new ApiRequestError(429, "Too many requests. Please wait before trying again.", Math.max(1, Math.ceil((end - now) / 1000)));
}

export async function enforceAbuseLimit(action: AbuseAction, subject: string, now = Date.now()) {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("Missing quota key");
    // Never persist email addresses or trust caller-supplied forwarding headers.
    // Global budgets also bound rotating accounts/addresses on any deployment.
    const identity = createHmac("sha256", secret).update(`bidlane:abuse:${action}:${subject.trim().toLowerCase()}`).digest("hex");
    await prisma.abuseQuota.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
    const policy = abusePolicies[action];
    for (const [limit, windowMs] of policy.global) await consume(`${action}:global:${windowMs}`, limit, windowMs, now);
    for (const [limit, windowMs] of policy.subject) await consume(`${action}:subject:${identity}:${windowMs}`, limit, windowMs, now);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // A quota outage must not expose an unlimited expensive-work path.
    throw new ApiRequestError(503, "This action is temporarily unavailable. Please try again later.");
  }
}
