import { getNativeRepositories } from "./native-repositories";

async function quotaRetryAfter(key: string, limit: number, windowMs: number, now: number, mode: "check" | "consume" = "consume") {
  const window = Math.floor(now / windowMs);
  const id = `${key}:${window}`;
  if (mode === "check") {
    const bucket = await getNativeRepositories().quotas.upload.read(id);
    return bucket && bucket.count >= limit ? Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000)) : 0;
  }
  const bucket = await getNativeRepositories().quotas.upload.consume(id, new Date((window + 1) * windowMs));
  return bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now) / 1000));
}

// Shared budgets cover attempts, including rejected files and provider errors.
// Global budgets bound cost even when an attacker rotates signed-in accounts.
export async function uploadRetryAfter(userId: string, now = Date.now()) {
  await getNativeRepositories().quotas.upload.deleteExpired(new Date(now));
  const globalBudgets = [["global:hour", 100, 3_600_000], ["global:day", 500, 86_400_000]] as const;
  // Avoid allocating account buckets during global exhaustion. This read is
  // only an early rejection; atomic consumption below remains authoritative.
  for (const [key, limit, windowMs] of globalBudgets) {
    const retryAfter = await quotaRetryAfter(key, limit, windowMs, now, "check");
    if (retryAfter) return retryAfter;
  }
  // Blocked accounts must not spend other accounts' shared allowance.
  for (const [key, limit, windowMs] of [
    [`user:${userId}:hour`, 40, 3_600_000], [`user:${userId}:day`, 100, 86_400_000],
    ...globalBudgets,
  ] as const) {
    const retryAfter = await quotaRetryAfter(key, limit, windowMs, now);
    if (retryAfter) return retryAfter;
  }
  return 0;
}
