import { ApiRequestError } from "./api-request";

export function requireVerifiedEmail(user: { emailVerified?: Date | null }, action: "bid" | "submit a listing") {
  if (!user.emailVerified) throw new ApiRequestError(403, `Verify your email in Account → Profile before you ${action}.`);
}
