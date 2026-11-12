import { createHash, randomBytes } from "node:crypto";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { isDuplicateKey, verificationTransactionOptions } from "@/prisma/native/transaction-errors";
import { ApiRequestError } from "./api-request";
import { getEmailConfiguration } from "./outbid-email";

export const verificationHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestEmailVerification(user: { id: string; email: string | null; emailVerified?: Date | null }) {
  if (user.emailVerified) return { verified: true };
  const config = getEmailConfiguration();
  if (!config || !user.email) throw new ApiRequestError(503, "Verification email is unavailable. Please try again later.");
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const cooldown = () => new ApiRequestError(429, "Please wait one minute before requesting another verification email.");
  try {
    await withNativeTransaction(async (tx) => {
      const existing = await tx.emailVerifications.find(user.id);
      if (existing && existing.requestedAt.getTime() > now.getTime() - 60_000) throw cooldown();
      await tx.emailVerifications.replace({
        id: user.id, email: user.email!, tokenHash: verificationHash(token), requestedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60_000),
      });
    }, verificationTransactionOptions);
  } catch (error) {
    // Concurrent first requests can race on the ObjectId primary key. MongoDB
    // does not always retry a duplicate-key upsert inside a transaction.
    if (isDuplicateKey(error)) {
      const existing = await getNativeRepositories().emailVerifications.find(user.id);
      if (existing && existing.requestedAt.getTime() > now.getTime() - 60_000) throw cooldown();
    }
    throw error;
  }
  // A fragment keeps the token out of server access logs and Referer headers.
  // The page requires an explicit POST so link scanners cannot consume it.
  const url = new URL("/verify-email", config.origin);
  url.hash = `token=${token}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.from, to: [user.email], subject: "Verify your BidLane email",
      text: `Confirm your email address for BidLane:\n\n${url.href}\n\nThis link expires in 30 minutes and can be used once. If you didn’t request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== "string" || !result.id) {
    throw new ApiRequestError(502, "We couldn’t send your verification email. Wait one minute and try again.");
  }
  return { sent: true };
}

export async function confirmEmailVerification(token: string) {
  const now = new Date();
  await withNativeTransaction(async (tx) => {
    const record = await tx.emailVerifications.findByTokenHash(verificationHash(token));
    if (!record || record.expiresAt <= now) throw new ApiRequestError(400, "This verification link is invalid or expired. Request a new one from your profile.");
    const claimed = await tx.emailVerifications.claim(record, now);
    if (claimed.count !== 1) throw new ApiRequestError(400, "This verification link has already been used.");
    // Bind the proof to the exact address originally emailed, even if account
    // email editing is added later. Claim and update commit atomically.
    const updated = await tx.emailVerifications.verifyUser(record, now);
    if (updated.count !== 1) throw new ApiRequestError(400, "This verification link no longer matches your account.");
  }, verificationTransactionOptions);
}
