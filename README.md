# BidLane

BidLane is a vehicle auction app built with Next.js, React, TypeScript, and MongoDB. Buyers can browse upcoming, live, and past auctions, follow listings, and bid with live updates. Sellers can submit vehicles, manage photos, and run auctions from their accounts.

## Features

- **Auction browsing:** Share URL-based search, status filters, and sorting by newest, ending soon, bid amount, or mileage; view photo galleries and follow live countdowns.
- **Home page spotlight:** Feature vehicle photography with live auction, upcoming listing, and past result fallbacks, plus watchlist controls.
- **Live bidding:** Pusher broadcasts bids, auction status changes, comments, and countdown extensions.
- **Seller tools:** Submit vehicle specifications, service history, modifications, and known flaws through a guided details → condition → photos → preview flow; set reserve prices, manage photos, and start auctions with a starting bid, bid increment, and end time.
- **Accounts:** Email/password registration and sign-in, plus GitHub and Google OAuth.
- **Personal dashboards:** Manage listings and watchlists, review bids and wins, edit profiles, and view saved auction activity notifications with read status shared across devices and a live unread badge. Optional outbid emails include an account-level opt-out.
- **Post-auction coordination:** Buyers and sellers can find sold auction results and counterparty contact details under **Account → Purchases & sales**, with guidance for agreeing payment, paperwork, and pickup. The existing `/account/shipments` URL remains valid for saved links and notifications.
- **Responsive interface:** Tailwind CSS styling for desktop and mobile layouts.

## Stack

| Area              | Technology                                          |
| ----------------- | --------------------------------------------------- |
| Application       | Next.js 16 App Router, React 19, TypeScript         |
| Styling and forms | Tailwind CSS 3, React Hook Form, React Icons        |
| Database          | MongoDB with Prisma 6                               |
| Authentication    | NextAuth.js 4, Prisma adapter, bcrypt, JWT sessions |
| Live updates      | Pusher Channels                                     |
| Images            | Cloudinary and next-cloudinary                      |
| Checks            | Vitest, ESLint 9, TypeScript                        |

## Local setup

### 1. Install dependencies

Use Node.js **24.x** and npm. From your checkout:

```bash
cd bidlane
npm ci
```

### 2. Configure services and environment variables

You need a MongoDB deployment configured as a replica set (for example, MongoDB Atlas), a Pusher Channels app, and a Cloudinary account. Bidding uses database transactions, so a standalone MongoDB server is insufficient.

Create `.env` in the repository root. This makes the configuration available to both Next.js and the Prisma CLI. The file is gitignored; use your own values and keep secrets out of version control.

```dotenv
# MongoDB — include the database name
DATABASE_URL="mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/bidlane"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-random-secret"

# Cloudinary — names match app/libs/cloudinary.ts
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloud-name"
NEXT_PUBLIC_CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Pusher Channels — the app currently uses the us2 cluster
PUSHER_APP_ID="your-app-id"
NEXT_PUBLIC_PUSHER_APP_KEY="your-app-key"
PUSHER_SECRET="your-app-secret"

# Authenticates scheduled auction finalization and notification email delivery
CRON_SECRET="replace-with-another-random-secret"

# Resend: required for the contact form; optional for outbid emails
RESEND_API_KEY="re_your-api-key"
EMAIL_FROM="BidLane <alerts@your-verified-domain.com>"

# GitHub OAuth
GITHUB_ID="your-github-client-id"
GITHUB_SECRET="your-github-client-secret"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

Generate independent values for `NEXTAUTH_SECRET` and `CRON_SECRET`, for example with `openssl rand -base64 32`.

Service configuration:

- **MongoDB:** Allow the development machine to connect and create a database user with access to the configured database.
- **Pusher:** Create the app in `us2`. To use another cluster, update both [app/libs/pusher-client.ts](app/libs/pusher-client.ts) and [app/libs/pusher.ts](app/libs/pusher.ts).
- **Cloudinary:** Create an unsigned upload preset named `auctions`, which the listing and profile upload widgets use.
- **OAuth:** Configure callback URLs as `http://localhost:3000/api/auth/callback/github` and `http://localhost:3000/api/auth/callback/google`. Credentials sign-in does not require OAuth keys, but both social providers are registered and their buttons require valid provider credentials.
- **GitHub account linking:** GitHub sign-in automatically links to an existing user with the same email after checking that GitHub has verified the address. This preserves the existing user's password, listings, and account data. The authenticated email API requires the requested `user:email` scope (or read access to email addresses for GitHub Apps); sign-in fails if email verification cannot be confirmed. Google retains NextAuth's default linking policy. Registering with email/password after GitHub sign-in still rejects an existing email; it does not add a password.
- **GitHub account persistence:** Keep `Account.refresh_token_expires_in` in the Prisma schema. NextAuth v4 forwards GitHub's token response to the adapter, and Prisma rejects account creation if this optional field is missing. Regenerate Prisma Client and redeploy after schema changes (`npm run build` includes generation). MongoDB accepts the optional field without backfilling existing accounts.

### 3. Initialize Prisma and the database

```bash
npx prisma generate
npx prisma db push
```

This repository uses Prisma 6 with MongoDB, which uses `db push` to synchronize the schema instead of Prisma Migrate. See the [Prisma 6 schema prototyping guide](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/prototyping-your-schema).

There is no seed script. Register an account and submit a vehicle through the app to create your first listing.

### 4. Start the app

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). To try bidding, use a second account: sellers cannot bid on their own listings.

Auction views use `q` for search, `status=live|upcoming|ended` for the home page tabs, and `sort=newest|ending-soon|bid-low|bid-high|mileage-low`. For example, `/?status=live&q=Porsche&sort=bid-high#auctions` opens matching live auctions with the highest bids first. The old `/live/listings`, `/future/listings`, and `/past/listings` URLs permanently redirect to their matching homepage tabs, preserving search and sorting. Missing or unsupported values open the Live tab with newest listings. Status and sort changes create browser history entries; typing search updates the current entry. Unknown bid amounts appear last in both bid sort directions, and ending soon puts live auctions with scheduled end times first.

## Development commands

| Command               | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Start the development server                                |
| `npm run build`       | Create a production build                                   |
| `npm start`           | Serve the production build                                  |
| `npm test`            | Run Vitest once                                             |
| `npm run test:watch`  | Run Vitest in watch mode                                    |
| `npm run lint`        | Run ESLint                                                  |
| `npm run lint:fix`    | Apply automatic lint fixes                                  |
| `npx tsc --noEmit`    | Check TypeScript types                                      |
| `npx prisma generate` | Regenerate the Prisma client after schema changes           |
| `npx prisma db push`  | Synchronize the schema with the configured MongoDB database |
| `npx prisma studio`   | Open the database browser                                   |

Tests live alongside the implementation as `*.test.ts` or `*.test.tsx` files. API and data tests run in Vitest's Node environment; React hook and component tests opt into jsdom. Coverage includes auction transitions, bid validation, finalization, API authorization, data helpers, and live auction state reconciliation after refreshes and missed events.

Run `npm run lint` separately from `npm run build`; the Next.js production build does not run ESLint.

Before changing Next.js code, follow [AGENTS.md](AGENTS.md) and read the relevant guides in `node_modules/next/dist/docs/` for the installed version.

## Administrator access

Admins use ordinary BidLane accounts with the `ADMIN` role. Public registration
and profile updates cannot assign roles. New accounts default to `USER`; existing
MongoDB users with a missing or null role are treated as regular users.
Administration includes an overview and listing review tools.

Before deploying role changes, regenerate the Prisma client (`npx prisma generate`;
also included in `npm run build`). The optional role field requires no backfill
or new database indexes.

1. Register normally or sign in with Google/GitHub to create the intended account.
2. From a trusted checkout with the updated Prisma client and access to the
   intended database, run:

   ```bash
   npm run admin:grant -- your@email.com
   ```

3. Visit `/admin`, or use **Account → Administration**. Refresh the account page
   after granting access to see its new navigation link.

To remove access:

```bash
npm run admin:revoke -- your@email.com
```

These commands load the root `.env` when present; already-set environment
variables take precedence. Check that `DATABASE_URL` points to the intended
database before running them. Email matching is exact, including case, just as
it is for sign-in. The commands update only an existing account's role and are
safe to repeat. They cannot create accounts or alter passwords. Admins can revoke
their own access; a trusted operator can restore it with the grant command.

`/admin` shows account, listing, and live auction counts. Its data endpoint,
`GET /api/admin/overview`, returns `401` for signed-out requests and `403` for
regular users. The page sends signed-out users to sign-in and returns a not-found
page for regular users. Both paths authorize against the current database role;
revocation applies on the next server request without signing out (an already
open overview remains visible until refreshed).

When adding admin tools, call `requireAdmin()` from `app/libs/admin.ts` at each
server data or mutation entry point, before accessing privileged data. Do not
rely on navigation visibility, a layout, the proxy, or a role supplied by the
browser/JWT. `getAdminOverview()` demonstrates the shared page/API pattern.

## Listing review and moderation

Open **Administration → Review listings** (`/admin/listings`) to see upcoming
listings awaiting review, approved listings, or listings needing changes. The
queue includes older upcoming listings without review fields and loads 20 at a
time. Each review page shows the seller, reserve, disclosures, records, cover,
and all photos. Admins can approve or request changes; requesting changes
requires a reason of up to 2,000 characters, shown to the seller in Account →
Listings and on their listing page.

Unapproved upcoming listings are hidden from the homepage, seller profiles,
watchlists, and other visitors' direct listing/image requests. Comments open
only after approval. Sellers can use **Edit listing & submit for review** to
correct all details, add/remove photos, select a cover, and update records. Each
successful save requeues the listing as `PENDING`, clears its current feedback,
and invalidates approval. Saved review decisions remain in the admin history.
The seller can start bidding only while the latest revision is approved; all
content edits are frozen after bidding opens.

`POST /api/admin/listings/[id]/review` accepts `{ revision, decision, reason }`
with `decision` equal to `APPROVED` or `CHANGES_REQUESTED`. It checks the current
admin role, upcoming auction status, and expected revision. The decision and
`ListingReview` audit entry (reviewer ID/name, decision, reason, revision, and
timestamp) commit in one MongoDB transaction. Stale reviews and conflicting
edits return `409`. `PATCH /api/listing/[id]` accepts `{ revision, data,
coverImage }` from the owner to save and resubmit a complete corrected listing.
Legacy VIN/record and photo mutation endpoints also invalidate approval.

Before deploying, run `npx prisma generate` and `npx prisma db push` against the
intended database to add the `ListingReview` collection/history index and the
listing review queue index, then deploy the generated client and app together.
No listing backfill runs: **existing upcoming listings require review and are
hidden until approved**. Existing live auctions and completed results remain
public and cannot be moderated through this workflow. This feature reviews
submissions; it does not certify ownership or vehicle condition, cancel active
auctions, delete listings, or suspend accounts. Review status and seller
feedback update on a page refresh; moderation does not send email alerts.

## Auction lifecycle

New listings require transmission, drivetrain, title status, service history, modifications, and known flaws alongside the existing listing fields, plus 1–20 uploaded photos. Specifications use the choices in `app/libs/vehicle-details.ts`, including an explicit `Unknown` option. Each disclosure is trimmed and limited to 4,000 characters; sellers must describe unknown history or state “None known” where appropriate. The preview and public listing show these disclosures, and the vehicle summary includes the three specifications. These are seller-reported details, not independent verification.

The six new `Listing` fields are nullable so existing MongoDB documents remain readable and display **Not provided** for missing information. Regenerate the Prisma client with `npx prisma generate` when updating an existing checkout. This change adds no indexes and requires no data backfill; deploying the regenerated client enables reads and writes of the optional MongoDB fields.

1. A submitted listing starts as `UPCOMING` with review status `PENDING`, visible only to its seller and admins.
2. An admin approves the listing or requests changes with feedback. After approval, the listing is public and its seller starts the auction, setting a starting bid, bid increment, and future end time. The listing becomes `LIVE`.
3. Accepted bids update the current price and highest bidder. A bid in the final two minutes sets the end time to **two minutes after that bid**.
4. Finalization changes an expired live auction to `ENDED`. The result is `SOLD` when a bid exists and meets any reserve; otherwise it is `RESERVE_NOT_MET`.

Pusher events use listing-specific channels (`listing-<id>`). Auction finalization runs through a scheduled endpoint, and active listing pages also request finalization when their countdown reaches zero.

The **How it works** page (`/faq`) explains the two-minute extension, bid minimums, reserves, auction results, and the handoff. Direct links are `/faq#auction-rules`, `/faq#after-auction`, and `/faq#fees`. Bidding views link to these explanations, and a sold listing links its winning buyer and seller to their purchase or sale details. BidLane currently charges no platform fees: no listing fees, buyer’s premiums, or seller commissions. Vehicle payment and costs such as inspection, transport, insurance, taxes, and registration are arranged separately. The current app records auction outcomes and contact information; it does not process or confirm vehicle payment or track delivery.

[vercel.json](vercel.json) declares a once-per-minute request to `/api/cron/finalize-auctions`. The endpoint requires an `Authorization: Bearer <CRON_SECRET>` header and processes up to 100 expired auctions per request. Its response reports `checked`, `finalized`, `skipped`, `failed`, and `hasMore`.

## Project layout

```text
app/
├── (site)/          # Home page, auction browser, authentication components
├── account/         # Listings, bids and wins, profile, notifications, purchases and sales
├── actions/         # Server-side data access helpers
├── api/             # Route handlers and colocated tests
├── components/      # Shared interface components
├── context/         # Authentication, auction state, notification, and toast providers
├── hooks/           # Countdown, listing, watchlist, and Pusher hooks
├── libs/            # Service clients, validation, auction finalization
├── listing/[id]/    # Auction detail page and interactions
├── live/            # Live auctions
├── future/          # Upcoming auctions
├── past/            # Past auctions
├── submit-listing/  # Vehicle submission
└── utils/           # Formatting helpers
prisma/schema.prisma # User, Account, Listing, Bid, Comment, and Notification models
proxy.ts             # Authentication for account, submission, and user routes
public/              # Static assets
vercel.json          # Auction finalization and notification email schedules
vitest.config.ts     # Test configuration
```

## Key API routes

| Route                           | Method    | Purpose                                                    |
| ------------------------------- | --------- | ---------------------------------------------------------- |
| `/api/auth/[...nextauth]`       | GET, POST | NextAuth authentication                                    |
| `/api/register`                 | POST      | Register a credentials account                             |
| `/api/account/profile`          | PATCH     | Update the current user's profile                          |
| `/api/new-listing`              | POST      | Create a vehicle listing                                   |
| `/api/auction-start`            | POST      | Start a seller's upcoming auction                          |
| `/api/place-bid`                | POST      | Place a bid on a live auction (requires `Idempotency-Key`) |
| `/api/auction-end`              | POST      | Seller-triggered finalization after the scheduled end time |
| `/api/auction-finalize`         | POST      | Finalize an expired auction                                |
| `/api/cron/finalize-auctions`   | GET       | Finalize expired auctions in a batch                       |
| `/api/comments`                 | POST      | Add a listing comment                                      |
| `/api/update-watchlist`         | POST      | Update the current user's watchlist                        |
| `/api/listing-view`             | POST      | Record a listing view                                      |
| `/api/cloudinary-images`        | GET, POST | Read saved listing images or attach an uploaded image      |
| `/api/listing/[id]/cover-image` | POST      | Update a listing's cover image                             |

Image uploads use Cloudinary widgets. New listings include the uploaded photo URLs in `/api/new-listing`; adding photos to an existing listing saves them through `/api/cloudinary-images`. The gallery renders saved images supplied by the listing page without a second image-list request.

Application-owned API failures return JSON with an `error` string and an appropriate HTTP status. Malformed JSON, non-object bodies, and invalid fields return `400`; unexpected failures return `500` with a public message while details are logged on the server. Partial cron failures retain the batch summary and add an `error` string. NextAuth's authentication endpoints use their own protocol.

### Bid request retries

`POST /api/place-bid` requires an `Idempotency-Key` header containing 16–128 ASCII letters, digits, underscores, or hyphens. Generate a fresh UUID for each confirmed bid; reuse that key with the same listing and amount when retrying an uncertain request. Keys are scoped to the authenticated user. Reusing an accepted key with a different listing or amount returns `409`.

The bid, auction updates, notifications, and `BidSubmission` response snapshot commit in one transaction. Successful retries return the original `201` response, including its original auction deadline, even after the auction changes or ends; they create no new bids, notifications, or extensions. A replay confirms historical acceptance, not that the bidder still leads. Rejected requests do not reserve a key. Transaction contention is retried up to three times, then returns `503`; retry with the same key.

The bid form preserves its request key and exact amount while retrying network failures or server errors, and allows that retry after auction end. This pending state lasts while the form remains mounted; reloading or leaving the page clears it. Successful request records have no automatic expiration.

Before deploying, run `npx prisma db push` against the target database to create the `BidSubmission` collection and its unique `(userId, key)` index, then deploy the generated Prisma client and application together. Existing bids need no backfill. MongoDB must support transactions (a replica set).

## Saved listing drafts and photo guidance

Vehicle submissions autosave after 1.5 seconds of inactivity to a separate, owner-only `ListingDraft` collection. Incomplete or temporarily invalid fields are preserved without publishing anything. **Save draft** saves immediately; **Save & exit** waits for a save before returning to Account → Listings. Wait for **Draft saved** before navigating away. Refreshing a saved `/submit-listing?draft=<id>` link restores details, current step, photo order/cover, vehicle records (including unfinished labels), and the private photo checklist. Reloading or closing a tab with unsaved changes triggers the browser’s standard warning; in-app navigation and browser shutdown cannot guarantee a final write. Drafts are saved to the account, not browser local storage.

Account → Listings shows saved drafts with resume and delete actions. Every draft read/write/delete and server-side resume lookup checks the signed-in owner. Drafts do not enter public auction browsing, seller profiles, search, or live bidding. Cloudinary upload URLs are still publicly accessible if someone has the URL: private draft metadata is not private media hosting. Removing a photo, record, or draft removes saved references, not Cloudinary assets. Deleting a draft clears its saved payload and keeps an internal marker so an uncertain create retry cannot resurrect it.

Saves serialize in the browser and use version checks on the server. A stale tab receives `409` and keeps its unsaved inputs visible instead of overwriting another device’s work. Lost responses retry with the same draft ID/save key; the client resolves an uncertain earlier save before applying newer edits. Publication uses `POST /api/new-listing` with `{ draftId, revision }`, validates the saved snapshot against the full listing schema, and atomically creates the listing and links the draft to it. Repeated publication of that revision returns the same listing. Publication creates an **UPCOMING** listing awaiting admin review; published drafts disappear from the draft list and old resume links redirect to the listing. Existing direct `{ data }` submissions remain supported for compatibility.

Draft endpoints are `POST /api/listing-drafts` and `GET`, `PATCH`, `DELETE /api/listing-drafts/[id]`. Creation accepts a client-generated ObjectId, UUID save key, and bounded payload. Updates include the saved revision; deletion requires `{ revision }`. Photo URLs and record URLs remain validated even in incomplete drafts. Draft fields allow up to 100 characters for make/model, 200 for location, 10,000 for description, and the existing 4,000 per disclosure.

The photo step provides an optional private checklist for exterior, interior, engine bay, underside, wheels/tires, and known damage/flaws, plus safe capture guidance. It is a seller planning tool, not automatic photo or condition verification. The existing **20-photo** limit applies to drafts, listing creation, and later gallery uploads. Sellers can choose the cover, move photos earlier, or remove them; order and cover persist through resume and publication.

Before deploying, run `npx prisma generate` and `npx prisma db push` against the target database to create `ListingDraft` and its owner/status/update index, then deploy the generated client and app together. MongoDB transactions are required for draft creation/publication. Existing listings need no backfill. Tests mock database and uploads; verify a real save, cross-device resume, and publication after setup.

## Password recovery

The sign-in form links to `/forgot-password`; `/reset-password` accepts the emailed fragment token and asks for a new password twice. Recovery uses the existing `RESEND_API_KEY`, verified `EMAIL_FROM`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `CRON_SECRET` values. No separate Resend credentials are required. New reset passwords must contain at least 12 characters and fit bcrypt’s 72-byte limit; existing passwords continue to work until changed.

`POST /api/forgot-password` validates the email and queues the same work for every valid address. It never queries accounts or waits on an email provider in the request path, and returns the same confirmation for eligible, unknown, connected-only, and throttled requests. Database-backed quotas allow three requests per address per fixed 15-minute window and 30 globally per fixed minute. The worker alone checks for an unambiguous, case-insensitive email match with an existing password; OAuth-only users must continue signing in through Google/GitHub. Legacy case-colliding accounts require support rather than guessing which account to reset.

Each request replaces prior links for that address. Tokens expire 30 minutes after the request and work once. The database stores a SHA-256 token hash and a random nonce; a domain-separated HMAC using `NEXTAUTH_SECRET` lets the delivery worker derive the link without persisting a plaintext token. Links use the configured application origin, not request host headers. The reset page captures and removes the URL fragment and never consumes a token on load. Confirmation validates both passwords, atomically claims the unused nonexpired token, updates only the bound password account, rotates its session version, and queues a password-change notice. Neither requesting a link nor receiving mail changes the password or signs anyone out.

`GET /api/cron/send-recovery-emails` requires `Authorization: Bearer <CRON_SECRET>`. The once-per-minute schedule is declared in `vercel.json`; configure an equivalent scheduler on other hosts. Run it frequently enough that reset emails arrive before their 30-minute expiry. The worker leases jobs across instances, retries transient failures up to five delivery attempts, and uses stable Resend idempotency keys for uncertain delivery. Replaced/used/expired links and ineligible accounts are skipped. It processes up to 20 jobs within a 40-second budget per run. Completed mail jobs are retained for 30 days; reset records more than a day past expiry and expired quota buckets are cleaned up during processing. Provider acceptance does not guarantee inbox delivery; check Resend logs for bounces.

Password reset rotates nullable `User.sessionVersion`. Both NextAuth session decoding and the authenticated-page proxy check it against the signed JWT, so existing cookies lose access on their next authenticated request. Legacy sessions without a version remain valid until the account’s first reset. Credentials logins capture the version before password comparison to reject a login racing a reset; client session updates cannot upgrade a revoked token. Fresh Google/GitHub sign-ins still work. The current browser clears its session cache on successful reset, then offers normal sign-in rather than signing in automatically.

Before deploying, run `npx prisma generate` and `npx prisma db push` against the target database to create `PasswordReset` (including the unique token hash), `PasswordResetQuota`, and `RecoveryEmail` collections/indexes, then deploy the client and app together. No user backfill is required. MongoDB transactions and a working recovery-email scheduler are required. Automated tests mock MongoDB and Resend; verify real delivery, reset, and old-session rejection after service setup. The design follows [OWASP’s password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Trust and verification

Account → Profile lets a signed-in user request a verification email using the same `RESEND_API_KEY`, `EMAIL_FROM`, and `NEXTAUTH_URL` as auction emails. `POST /api/account/verify-email` sends only to the authenticated account’s address, with a one-minute resend cooldown stored in MongoDB. The link expires after 30 minutes; requesting another invalidates the previous link. Only SHA-256 token hashes are stored. The `/verify-email` page reads the secret from a URL fragment, clears it from browser history, and requires an explicit confirmation POST so ordinary email link scanners do not consume it. Confirmation claims the single-use token and updates the matching user/email in one database transaction. Failed sends still observe the one-minute cooldown. Existing users are not marked verified automatically, and verification is optional for existing auction flows.

Public seller profiles at `/sellers/[id]` show the public name/photo, membership date, email-verification status, latest current listings, and paginated sold auction results. They do not expose email addresses, password hashes, reserves, or private account activity. An **Email verified** badge means inbox access only. **Sold at auction** reports an auction outcome, not confirmed payment or completed handoff; completed transaction tracking remains separate work. BidLane currently has no independent inspection or curation workflow, and the homepage no longer claims curated inventory.

Listings support an optional seller-reported VIN/chassis identifier and up to ten labeled public records (PDF, JPG, PNG, WebP). Identifiers normalize to uppercase and accept older/imported chassis numbers; this is basic character/length validation, not VIN decoding, checksum verification, title checks, or proof of ownership. Records upload through the existing Cloudinary `auctions` preset. The widget caps files at 10 MB; configure allowed formats and size limits on the unsigned preset too, since client restrictions are not server enforcement. For PDFs, ensure Cloudinary allows PDF delivery in its security settings; see [Cloudinary’s PDF guide](https://cloudinary.com/documentation/ts_how_to_upload_manage_and_deliver_pdf_files). Remove personal details before uploading: files are public. Deleting a record from an unpublished listing removes its reference, not the underlying Cloudinary asset. Contact support for removal of personal information published by mistake.

Sellers can edit VIN and records on upcoming listings via `PATCH /api/listing/[id]/vehicle-details`. Owner checks and a status-guarded write prevent edits once bidding opens. Existing listings show **Not provided** / **No records provided** for missing data. Uploaded records and vehicle details are explicitly labeled seller-provided and unauthenticated.

Before deploying, run `npx prisma generate` and `npx prisma db push` against the target database to create the `EmailVerification` collection and unique token-hash index, then deploy the generated client and app together. The nullable `Listing.vin` and `Listing.vehicleRecords` fields need no backfill. MongoDB must support transactions. Verify a real email and a PDF/image upload after configuring the services; automated tests mock service delivery.

## Contact form

`/contact` posts to `POST /api/contact` and sends a plain-text email through Resend to the fixed `support@bidlane.net` inbox. It uses the server-only `RESEND_API_KEY` and verified `EMAIL_FROM` sender above, with the visitor’s email as `Reply-To`. The page confirms provider acceptance, preserves fields on failure, and reuses a provider idempotency key on retries to reduce duplicate sends. Acceptance does not guarantee inbox delivery; check Resend delivery/bounce logs if a message is missing. No acknowledgment email is sent to the visitor.

Spam protection includes a hidden honeypot, bounded/validated fields, and atomic MongoDB quotas shared across instances: three attempts per email per fixed 15-minute window and 30 total per fixed minute. A `429` response includes `Retry-After`. Rotating addresses can exhaust the global budget; these are basic abuse controls, not a replacement for a CAPTCHA if targeted spam develops. Expired quota records are removed on subsequent requests; email addresses are hashed in quota keys and message bodies are not stored in MongoDB or application logs.

Before deploying, run `npx prisma generate` and `npx prisma db push` against the target database to create the `ContactRateLimit` collection/index, then deploy the generated client and application together. Missing mail configuration or database failures return a retryable error with the direct support address. Verify a real submission in the support inbox after configuring Resend.

## Notifications

Outbid alerts, auction results for sellers and bidders, watched-auction starts, and comments from buyers are saved in MongoDB alongside their originating state changes. Each recipient/event pair has a unique key, so replaying an event preserves its original contents and read timestamp. An outbid alert goes only to the previous leader; increasing your own bid does not create one. A win or sale is recorded only when the reserve is met.

The inbox loads 50 records at a time and stores read timestamps on the server. “Mark all as read” applies through the newest event currently shown, leaving newer arrivals unread. The header and inbox refresh on private Pusher events, reconnect, window focus, and every 30 seconds while the page is visible. Live delivery failures do not discard saved notifications or fail a committed bid or result.

Apply the schema with `npx prisma db push` before deploying this feature; this creates the `Notification` collection and its unique and query indexes. Notifications are recorded for new events after deployment. Previously generated activity cards and browser-local read receipts are not imported.

### Outbid email delivery

Configure a [Resend](https://resend.com/docs/api-reference/emails/send-email) API key and a sender on a verified domain using `RESEND_API_KEY` and `EMAIL_FROM`. `NEXTAUTH_URL` supplies the public origin for auction and preference links; use HTTPS in production. Never use a `NEXT_PUBLIC_` variable for the API key. Without this configuration the worker returns `503` and leaves the email queue untouched.

New outbid events enter the email queue in the same transaction as the bid and in-app notification. The second schedule in `vercel.json` calls `/api/cron/send-notification-emails` every minute, independently of auction finalization. It uses the existing `CRON_SECRET` bearer header, processes up to 20 records within a 40-second work budget, and returns `checked`, `sent`, `skipped`, `retried`, `failed`, and `hasMore`. Typical notification latency is up to a scheduler interval plus provider processing. On other hosts, schedule this endpoint alongside the finalization endpoint. Local development requires an explicit authenticated request to exercise the worker.

Outbid emails are enabled by default and can be disabled under **Account → Notifications → Email notifications**. The worker checks that preference before sending, including queued retries. Before a first attempt it also skips missing recipients, already-read alerts, closed or expired auctions, and bidders who have regained the lead. Only outbid alerts are emailed; other notification types remain in the inbox.

Workers claim records with a two-minute lease. Before contacting Resend, the worker saves an immutable message payload and uses `outbid/<notification-id>` as its [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys). Retried requests retain the original recipient and content; a changed recipient address cancels the queued message. Temporary failures retry with exponential delays from one minute to 30 minutes, honoring longer provider retry delays up to an hour, with at most eight claimed attempts. Rate-limit and authorization errors pause the rest of the batch. To stay inside Resend’s 24-hour duplicate-protection window, previously attempted messages stop retrying after 23 hours. A crashed worker can resume using the same request without creating a new event or key.

Delivery state is stored on the notification (`emailStatus`, attempt count, next attempt time, provider ID, and a sanitized failure code). `SENT` means Resend accepted the request; this feature does not consume delivery/bounce webhooks. Retries use the original message, so an alert first attempted while an auction was live may arrive after its status changes. Failed or skipped mail does not remove the in-app notification. No historical email backfill runs during deployment.

Authenticated endpoints:

| Route                                   | Method | Purpose                                                                                                                                                         |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/notifications`                    | GET    | Current account's paginated inbox; `view=unread` filters unread records; `cursor=<id>` loads older events; `summary=1` returns only account ID and unread count |
| `/api/notifications`                    | PATCH  | Mark owned records read using `{ "ids": ["<id>"] }`, or mark older records using `{ "all": true, "before": "<ISO timestamp>" }`                                 |
| `/api/pusher/auth`                      | POST   | Authorize the signed-in account's `private-user-<id>` channel; accepts Pusher's form-encoded `socket_id` and `channel_name`                                     |
| `/api/account/notification-preferences` | PATCH  | Save the current account’s `{ "outbidEmailsEnabled": true/false }` preference                                                                                   |

### Ending-soon reminders

Auctions in their final hour generate one in-app reminder per watcher or bidder (including the leading bidder, excluding the seller). The same event queues an optional email. Overlapping runs and retries use stable notification keys; an auction is marked as reminded in the same transaction as its notifications. Each auction is reminded once, so watching or bidding after that batch does not generate another reminder.

`GET /api/cron/ending-soon-reminders` requires `Authorization: Bearer <CRON_SECRET>` and runs every minute via `vercel.json`. It processes up to 100 auctions within a 40-second work budget and returns `checked`, `queued` (auctions processed), `skipped`, `failed`, and `hasMore`. Missing reminder fields on existing MongoDB listings are treated as unreminded. On other hosts, schedule this endpoint every minute alongside the existing jobs.

Before deploying, run `npx prisma generate` and `npx prisma db push` to apply the updated MongoDB schema/index. Reminder emails use the existing Resend configuration and `/api/cron/send-notification-emails` worker; in-app reminders work without email configuration. Accounts can independently disable reminder emails under `/account/notifications`, using `PATCH /api/account/notification-preferences` with `{ "endingSoonEmailsEnabled": false }`. This also suppresses queued emails. Before every reminder email attempt, the worker checks that the auction is still live and unexpired, the reminder is unread, and the recipient still watches or has bid. Retries preserve the original payload and provider idempotency key. Delivery timing depends on scheduler and email queue capacity.

## Deployment

1. Configure the environment variables on the deployment platform. Set `NEXTAUTH_URL` and OAuth callbacks to the production origin. Bidlane redirects the apex domain to `www`, so set `NEXTAUTH_URL=https://www.bidlane.net`, the GitHub callback to `https://www.bidlane.net/api/auth/callback/github`, and the Google callback to `https://www.bidlane.net/api/auth/callback/google`. Start sign-in on that same host so OAuth cookies survive the round trip. Redeploy after updating server environment variables. Set `NEXT_PUBLIC_` values before building; changes to those values require a rebuild.
2. Ensure the deployment can reach MongoDB, Cloudinary, and Pusher.
3. Build the app with `npm run build`, which generates the Prisma client before running the Next.js production build. On Vercel, use `npm run build` as the Build Command. Synchronize reviewed schema changes with the target database using `npx prisma db push`.
4. On a Node.js host, run `npm start` to serve the build.
5. Configure scheduled auction finalization. For Vercel, the included configuration declares the jobs at one-minute intervals; use a plan that supports that frequency. On another host, schedule authenticated GET requests to `/api/cron/finalize-auctions` and `/api/cron/ending-soon-reminders` every minute. To enable optional outbid emails, configure Resend, apply the updated Prisma schema, and also schedule `/api/cron/send-notification-emails` every minute. If email delivery is disabled, remove its entry from `vercel.json` to avoid scheduled `503` responses.

Local development does not run the Vercel schedule automatically. To exercise the cron route locally, send the same authenticated GET request using your configured `CRON_SECRET`.

## Troubleshooting

- **Prisma cannot find `DATABASE_URL`:** Put it in the root `.env`; a value only in `.env.local` is not automatically loaded by the Prisma 6 CLI.
- **MongoDB transaction errors:** Check that the database runs as a replica set and that the connection string, database user, and network access are correct.
- **Uploads fail:** Check the Cloudinary cloud name and the unsigned `auctions` preset.
- **Live updates are missing:** Verify the Pusher app credentials and the `us2` cluster setting in both client and server configuration.
- **OAuth sign-in fails:** Check provider credentials and the callback URL for the current origin.
- **Auctions remain live after expiry:** Check the scheduler and its authorization header. The cron endpoint returns `401` when `CRON_SECRET` is absent or the header does not match.
- **Outbid emails are missing:** Check Resend credentials, verified sender, `NEXTAUTH_URL`, the email scheduler, and the account’s email preference. Inspect notification delivery fields with Prisma Studio: `PENDING` waits for its next attempt, `SENDING` has a recoverable lease, and `FAILED`/`SKIPPED` retain a reason code. A successful provider request is not proof of inbox delivery; inspect the Resend dashboard for delivery and bounce status.

## License

This project is private and proprietary.
