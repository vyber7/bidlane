import { createHash } from "node:crypto";
import { contactSchema } from "@/app/schemas/contact";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { contactRetryAfter } from "@/app/libs/contact-rate-limit";
import { logger } from "@/app/libs/logger";

export async function POST(request: Request) {
  try {
    const input = parseApiInput(contactSchema, await readJsonObject(request));
    // Silently accept the spam trap without emailing or consuming quotas.
    if (input.website) return Response.json({ success: true });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from || /[\r\n]/.test(from)) {
      return errorResponse("Messaging is temporarily unavailable. Please email support@bidlane.net directly.", 503);
    }

    const retryAfter = await contactRetryAfter(input.email);
    if (retryAfter) {
      return Response.json({ error: "Too many messages. Please wait before trying again." }, {
        status: 429, headers: { "Retry-After": String(retryAfter) },
      });
    }

    const payload = {
      from,
      to: ["support@bidlane.net"],
      reply_to: input.email,
      subject: `[BidLane support] ${input.topic} — ${input.name}`,
      text: `Name: ${input.name}\nEmail: ${input.email}\nTopic: ${input.topic}\n\n${input.message}`,
    };
    // Preserve the same provider key on retries after an uncertain timeout.
    // Include the payload hash so edited messages never reuse a different body.
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `contact/${input.submissionId}/${hash}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || typeof result?.id !== "string" || !result.id) {
      // Do not log provider bodies, which may contain the visitor's details.
      logger.warn("contact.email_rejected", { status: response.status });
      return errorResponse("We couldn’t send your message. Please try again or email support@bidlane.net.", 502);
    }
    return Response.json({ success: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    // Database/network errors can contain request data; keep contact logs private.
    logger.warn("contact.send_failed");
    return errorResponse("We couldn’t send your message. Please try again or email support@bidlane.net.", 503);
  }
}
