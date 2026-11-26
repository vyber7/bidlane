// Response headers for every route, applied from next.config.mjs. Plain ESM so
// the Next config can import it without a build step.

/** Where browsers send Content Security Policy violation reports. */
export const CSP_REPORT_PATH = "/api/csp-report";

/**
 * Third-party origins the browser talks to directly. Uploads go through our own
 * /api/uploads and OAuth sign-in is a full-page redirect, so neither needs one.
 */
const origins = {
  // Listing photos (CldImage) plus GitHub and Google profile pictures.
  images: ["https://res.cloudinary.com", "https://avatars.githubusercontent.com", "https://*.googleusercontent.com"],
  // Pusher Channels on the us2 cluster: WebSocket first, then the HTTP fallback.
  realtime: ["wss://ws-us2.pusher.com", "https://sockjs-us2.pusher.com"],
  // Vercel's toolbar on preview deployments only.
  vercelLive: ["https://vercel.live", "wss://ws-us3.pusher.com"],
};

/**
 * @param {{ dev?: boolean, preview?: boolean }} [options]
 * @returns {string}
 */
export function contentSecurityPolicy({ dev = false, preview = false } = {}) {
  const live = preview ? origins.vercelLive : [];
  /** @type {Record<string, string[]>} */
  const directives = {
    "default-src": ["'self'"],
    // Next.js inlines its hydration data as scripts; a nonce would need every
    // page rendered per request. React needs eval only in development.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...(preview ? ["https://vercel.live"] : [])],
    // Tailwind is a stylesheet, but React style props and toasts set inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...origins.images, ...(preview ? ["https://vercel.live", "https://vercel.com"] : [])],
    // next/font serves Inter from our own origin.
    "font-src": ["'self'", ...(preview ? ["https://vercel.live", "https://assets.vercel.com"] : [])],
    "connect-src": ["'self'", ...origins.realtime, ...live],
    "frame-src": preview ? ["https://vercel.live"] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": ["csp-endpoint"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/**
 * The policy is sent as Report-Only while violations are collected, so nothing
 * is blocked yet. Switch the key to Content-Security-Policy (and add
 * upgrade-insecure-requests, which Report-Only ignores) once reports are quiet.
 *
 * @param {{ dev?: boolean, preview?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const headers = [
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
    { key: "Reporting-Endpoints", value: `csp-endpoint="${CSP_REPORT_PATH}"` },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Older browsers that ignore frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    // OAuth sign-in navigates the whole window rather than opening a popup.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  // Browsers ignore HSTS over plain HTTP, and pinning localhost to HTTPS breaks other dev servers.
  if (!options.dev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  return headers;
}
