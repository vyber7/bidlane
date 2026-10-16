export type OutbidEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export function getEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const origin = process.env.NEXTAUTH_URL;
  if (!apiKey || !from || !origin || /[\r\n]/.test(from)) return null;
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return null;
    if (url.username || url.password) return null;
    return { apiKey, from, origin: url.origin };
  } catch {
    return null;
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function buildOutbidEmail({
  from,
  origin,
  to,
  vehicle,
  listingId,
}: {
  from: string;
  origin: string;
  to: string;
  vehicle: string;
  listingId: string;
}): OutbidEmailPayload {
  const auctionUrl = new URL(`/listing/${listingId}#bids`, origin).href;
  const settingsUrl = new URL("/account/notifications", origin).href;
  const message = `Another bidder has taken the lead on the ${vehicle}. Open the auction to check the latest price and time remaining.`;
  return {
    from,
    to: [to],
    subject: `You’ve been outbid — ${vehicle.replace(/[\r\n]/g, " ")}`,
    text: `You’ve been outbid\n\n${message}\n\nView auction: ${auctionUrl}\n\nYou received this because you bid on this vehicle. Manage outbid emails: ${settingsUrl}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>You’ve been outbid</title></head><body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px"><p style="margin:0 0 24px;font-size:22px;font-weight:bold">Bid<span style="color:#b45309">Lane</span></p><h1 style="font-size:28px;margin:0 0 16px">You’ve been outbid</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(message)}</p><p style="margin:28px 0"><a href="${escapeHtml(auctionUrl)}" style="display:inline-block;background:#fbbf24;color:#0f172a;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View auction</a></p><p style="font-size:12px;line-height:1.6;color:#64748b">You received this because you bid on this vehicle. <a href="${escapeHtml(settingsUrl)}" style="color:#475569">Manage outbid emails</a></p></td></tr></table></td></tr></table></body></html>`,
  };
}

export class EmailProviderError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
    public retryAfterMs = 0,
    public stopBatch = false,
  ) {
    super(code);
  }
}

export async function sendOutbidEmail(
  apiKey: string,
  payload: OutbidEmailPayload,
  notificationId: string,
) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `outbid/${notificationId}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new EmailProviderError("network_error", true);
  }
  if (!response.ok) {
    // Store provider codes only; response messages can contain email addresses.
    const body = await response.json().catch(() => null);
    const name =
      typeof body?.name === "string" && /^[a-z_]{1,80}$/.test(body.name)
        ? body.name
        : `http_${response.status}`;
    const retryHeader = response.headers.get("retry-after");
    const retryAfterMs = retryHeader
      ? Number.isFinite(Number(retryHeader))
        ? Number(retryHeader) * 1000
        : Date.parse(retryHeader) - Date.now()
      : 0;
    const retryable =
      response.status >= 500 ||
      [408, 429, 401, 403].includes(response.status) ||
      (response.status === 409 && name !== "invalid_idempotent_request");
    throw new EmailProviderError(
      name,
      retryable,
      Number.isFinite(retryAfterMs)
        ? Math.max(0, Math.min(retryAfterMs, 3600000))
        : 0,
      [429, 401, 403].includes(response.status),
    );
  }
  const body = await response.json().catch(() => null);
  if (typeof body?.id !== "string" || !body.id)
    throw new EmailProviderError("invalid_provider_response", true);
  return body.id as string;
}
