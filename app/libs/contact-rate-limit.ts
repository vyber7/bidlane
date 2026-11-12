import { createHash } from "node:crypto";
import { getNativeRepositories } from "./native-repositories";

async function quotaRetryAfter(key: string, limit: number, windowMs: number, now: number, mode: "check" | "consume" = "consume") {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
  if (mode === "check") {
    const bucket = await getNativeRepositories().quotas.contact.read(id);
    return bucket && bucket.count >= limit ? Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000)) : 0;
  }
  const bucket = await getNativeRepositories().quotas.contact.consume(id, new Date((window + 1) * windowMs));
  return bucket.count <= limit ? 0 : Math.ceil((bucket.expiresAt.getTime() - now) / 1000);
}

export async function contactRetryAfter(email: string, now = Date.now()) {
  await getNativeRepositories().quotas.contact.deleteExpired(new Date(now));
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
