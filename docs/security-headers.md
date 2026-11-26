# Security headers

`app/libs/security-headers.mjs` builds the response headers for every route, and `next.config.mjs` applies them.

## Content Security Policy rollout

The policy is sent as `Content-Security-Policy-Report-Only`, so violations are reported and nothing is blocked. Browsers post the reports to `/api/csp-report`, which logs each one as a `csp.violation` event with query strings removed.

Chrome sends Reporting API reports only to HTTPS endpoints, so check for them on a preview or production deployment, not on `localhost`.

To enforce the policy:

1. Let it run in production and review the `csp.violation` logs. Allow each legitimate source in `security-headers.mjs`. Treat anything else as a bug or an injection attempt.
2. When the logs are quiet, rename the header to `Content-Security-Policy` and add `upgrade-insecure-requests`. Report-Only ignores that directive.
3. Leave `report-uri` and `report-to` in place so violations keep being reported after enforcement starts.

## Known allowances

- `script-src 'unsafe-inline'`: Next.js inlines hydration data as scripts. Removing it needs a per-request nonce, which renders every page dynamically, or the experimental `sri` option.
- `style-src 'unsafe-inline'`: React `style` props and toasts set inline styles.
- zod runs with `jitless: true` (`app/schemas/zod.ts`). Otherwise its `new Function` probe reports a violation on every page with a form. Lint requires importing `z` from that module.
- The Vercel toolbar origins are allowed on preview deployments only.
