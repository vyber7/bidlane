# Abuse controls and input limits

Authentication and mutation budgets use atomic counters in MongoDB `AbuseQuota`,
shared across application instances. Counters expire at fixed UTC window
boundaries and expired buckets are removed during requests. Subject keys are
HMACs made with `NEXTAUTH_SECRET`; email addresses and IP addresses are not
stored. Email quota identities trim whitespace and ignore case. Password login
tries the exact trimmed address first for legacy compatibility, then accepts a
case-insensitive match only when it identifies one account. New password and
OAuth accounts store lowercase emails and reject case-insensitive matches against
existing accounts. See [email identity and legacy accounts](email-identity.md).

| Action | Per account/address | Across the application |
| --- | --- | --- |
| Password login | 10 attempts per 15 minutes | 100 per minute, 1,000 per hour |
| Registration | 3 attempts per hour | 10 per minute, 100 per hour |
| New bid | 30 attempts per minute | 600 per minute |
| Comment | 5 attempts per minute, 30 per hour | 120 per minute |

Login and registration enforce quotas before bcrypt work or account writes.
Failed logins, duplicate registrations, and rejected new bids consume attempts;
credential validation happens before quota allocation. Comments consume an
attempt after bounded input validation and before transaction work. A quota/database/configuration failure closes the action
with `503`; exhausted budgets return `429` with `Retry-After`. JSON login responses
also retain the URL envelope required by NextAuth's browser client. Ordinary
NextAuth form callbacks retain their error redirects. OAuth login
does not use the password-login budget.

Global budgets bound address/account rotation without relying on untrusted
forwarding headers. They can also throttle legitimate users during an attack;
monitor traffic and adjust `app/libs/abuse-limits.ts` to expected volume. These
application budgets complement hosting-level network/request protection.

Quota admission first checks shared budgets without incrementing them, then
atomically consumes every subject budget before charging shared budgets.
Requests already blocked by an account/address limit do not spend other users'
allowances. The initial shared check avoids creating new subject buckets when
the application is already at capacity; final atomic increments still enforce
global caps if concurrent requests pass that check. In-flight requests can
consume subject attempts before discovering that shared capacity was taken.
Uploads, contact messages, and password recovery use the same admission order.

All application JSON readers count actual streamed bytes with a 256 KiB default
cap. Smaller limits apply to registration (8 KiB), bids (4 KiB), and comments
(32 KiB). NextAuth POSTs accept at most 16 KiB before either JSON or URL-encoded
parsing; Pusher authorization forms accept 4 KiB. `Content-Length` is not trusted
for enforcement. Cloudinary uploads keep their separate strict 4 MB file policy.

Comments accept up to 4,000 characters and optional attachment URLs up to 2,048.
Registration names accept 60 characters and emails 254. New passwords require
at least 12 characters; all password inputs are limited to bcrypt's 72 UTF-8
bytes. Existing short passwords remain usable at sign-in. Published listing text uses the
same make/model (100), location (200), and description (10,000) limits as drafts.
Existing saved content is not rewritten.

New bids and new listing submissions require the current database user's
`emailVerified` value. Existing and new OAuth accounts also use the verification
flow when that value is absent; social sign-in alone does not backfill it.
Users can request verification in **Account → Profile**. Unverified users can
still sign in, browse, comment, upload, save/edit private drafts, and manage
existing listings. Previously accepted bid retries and already-published draft
retries return their original result without creating another bid/listing.
Transaction contention retries consume a new-bid quota once per HTTP request.

Before deployment, configure the existing `NEXTAUTH_SECRET`, verification email
settings (`RESEND_API_KEY`, `EMAIL_FROM`, `NEXTAUTH_URL`), and production database.
Run `npx prisma db push` to create the additive `AbuseQuota` collection/index, then
deploy the app and generated client together (`npm run build` regenerates it).
Do not use `--accept-data-loss`. Verify real email delivery before enabling the
new bidding/submission requirement. No existing account is marked verified
automatically. Automated checks exercise real NextAuth callback/CSRF behavior
with mocked database and password comparison; production database contention,
email delivery, and hosting behavior still need normal deployment smoke checks.
