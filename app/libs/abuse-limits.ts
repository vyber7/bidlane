import { createHmac } from "node:crypto";
import { getNativeRepositories } from "./native-repositories";
import { ApiRequestError } from "./api-request";

const minute = 60_000, hour = 60 * minute;
export const abusePolicies = {
  login: { global: [[100, minute], [1000, hour]], subject: [[10, 15 * minute]] },
  registration: { global: [[10, minute], [100, hour]], subject: [[3, hour]] },
  bid: { global: [[600, minute]], subject: [[30, minute]] },
  comment: { global: [[120, minute]], subject: [[5, minute], [30, hour]] },
} as const;
export type AbuseAction = keyof typeof abusePolicies;

async function enforceQuota(key: string, limit: number, windowMs: number, now: number, mode: "check" | "consume" = "consume") {
  const end = (Math.floor(now / windowMs) + 1) * windowMs;
  const id = `${key}:${end}`;
  if (mode === "check") {
    const bucket = await getNativeRepositories().quotas.abuse.read(id);
    if (bucket && bucket.count >= limit) throw new ApiRequestError(429, "Too many requests. Please wait before trying again.", Math.max(1, Math.ceil((end - now) / 1000)));
    return;
  }
  const bucket = await getNativeRepositories().quotas.abuse.consume(id, new Date(end));
  if (bucket.count > limit) throw new ApiRequestError(429, "Too many requests. Please wait before trying again.", Math.max(1, Math.ceil((end - now) / 1000)));
}

export async function enforceAbuseLimit(action: AbuseAction, subject: string, now = Date.now()) {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("Missing quota key");
    // Never persist email addresses or trust caller-supplied forwarding headers.
    // Global budgets also bound rotating accounts/addresses on any deployment.
    const identity = createHmac("sha256", secret).update(`bidlane:abuse:${action}:${subject.trim().toLowerCase()}`).digest("hex");
    await getNativeRepositories().quotas.abuse.deleteExpired(new Date(now));
    const policy = abusePolicies[action];
    // Check without charging first to avoid new subject buckets after global
    // exhaustion. A passing read never replaces the final atomic increment.
    for (const [limit, windowMs] of policy.global) await enforceQuota(`${action}:global:${windowMs}`, limit, windowMs, now, "check");
    for (const [limit, windowMs] of policy.subject) await enforceQuota(`${action}:subject:${identity}:${windowMs}`, limit, windowMs, now);
    for (const [limit, windowMs] of policy.global) await enforceQuota(`${action}:global:${windowMs}`, limit, windowMs, now);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // A quota outage must not expose an unlimited expensive-work path.
    throw new ApiRequestError(503, "This action is temporarily unavailable. Please try again later.");
  }
}
