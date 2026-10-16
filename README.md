# BidLane

BidLane is a vehicle auction app built with Next.js, React, TypeScript, and MongoDB. Buyers can browse upcoming, live, and past auctions, follow listings, and bid with live updates. Sellers can submit vehicles, manage photos, and run auctions from their accounts.

## Features

- **Auction browsing:** Search and filter vehicle listings, view photo galleries, and follow live countdowns.
- **Live bidding:** Pusher broadcasts bids, auction status changes, comments, and countdown extensions.
- **Seller tools:** Create listings with reserve prices, manage gallery and cover images, and start auctions with a starting bid, bid increment, and end time.
- **Accounts:** Email/password registration and sign-in, plus GitHub and Google OAuth.
- **Personal dashboards:** Manage listings and watchlists, review bids and wins, edit profiles, and view saved auction activity notifications with read status shared across devices and a live unread badge.
- **Post-auction coordination:** Buyers and sellers can find sold vehicles and counterparty contact details in the shipments dashboard.
- **Responsive interface:** Tailwind CSS styling for desktop and mobile layouts.

## Stack

| Area | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Styling and forms | Tailwind CSS 3, React Hook Form, React Icons |
| Database | MongoDB with Prisma 6 |
| Authentication | NextAuth.js 4, Prisma adapter, bcrypt, JWT sessions |
| Live updates | Pusher Channels |
| Images | Cloudinary and next-cloudinary |
| Checks | Vitest, ESLint 9, TypeScript |

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

# Authenticates scheduled auction finalization
CRON_SECRET="replace-with-another-random-secret"

# Optional: outbid emails through Resend
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
- **Pusher:** Create the app in `us2`. To use another cluster, update both client and server configuration in [app/libs/pusher.ts](app/libs/pusher.ts).
- **Cloudinary:** Create an unsigned upload preset named `auctions`, which the listing and profile upload widgets use.
- **OAuth:** Configure callback URLs as `http://localhost:3000/api/auth/callback/github` and `http://localhost:3000/api/auth/callback/google`. Credentials sign-in does not require OAuth keys, but both social providers are registered and their buttons require valid provider credentials.

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

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Apply automatic lint fixes |
| `npx tsc --noEmit` | Check TypeScript types |
| `npx prisma generate` | Regenerate the Prisma client after schema changes |
| `npx prisma db push` | Synchronize the schema with the configured MongoDB database |
| `npx prisma studio` | Open the database browser |

Tests live alongside the implementation as `*.test.ts` or `*.test.tsx` files. API and data tests run in Vitest's Node environment; React hook and component tests opt into jsdom. Coverage includes auction transitions, bid validation, finalization, API authorization, data helpers, and live auction state reconciliation after refreshes and missed events.

Before changing Next.js code, follow [AGENTS.md](AGENTS.md) and read the relevant guides in `node_modules/next/dist/docs/` for the installed version.

## Auction lifecycle

1. A submitted listing starts as `UPCOMING`.
2. Its seller starts the auction, setting a starting bid, bid increment, and future end time. The listing becomes `LIVE`.
3. Accepted bids update the current price and highest bidder. A bid in the final two minutes sets the end time to **two minutes after that bid**.
4. Finalization changes an expired live auction to `ENDED`. The result is `SOLD` when a bid exists and meets any reserve; otherwise it is `RESERVE_NOT_MET`.

Pusher events use listing-specific channels (`listing-<id>`). Auction finalization runs through a scheduled endpoint, and active listing pages also request finalization when their countdown reaches zero.

[vercel.json](vercel.json) declares a once-per-minute request to `/api/cron/finalize-auctions`. The endpoint requires an `Authorization: Bearer <CRON_SECRET>` header and processes up to 100 expired auctions per request. Its response reports `checked`, `finalized`, `skipped`, `failed`, and `hasMore`.

## Project layout

```text
app/
├── (site)/          # Home page, auction browser, authentication components
├── account/         # Listings, bids and wins, profile, notifications, shipments
├── actions/         # Server-side data access helpers
├── api/             # Route handlers and colocated tests
├── components/      # Shared interface components
├── context/         # Authentication, auction state, and toast providers
├── hooks/           # Countdown, listing, watchlist, and Pusher hooks
├── libs/            # Service clients, validation, auction finalization
├── listing/[id]/    # Auction detail page and interactions
├── live/            # Live auctions
├── future/          # Upcoming auctions
├── past/            # Past auctions
├── submit-listing/  # Vehicle submission
└── utils/           # Formatting helpers
prisma/schema.prisma # User, Account, Listing, Bid, and Comment models
public/              # Static assets
vercel.json          # Scheduled auction finalization
vitest.config.ts     # Test configuration
```

## Key API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth authentication |
| `/api/register` | POST | Register a credentials account |
| `/api/account/profile` | PATCH | Update the current user's profile |
| `/api/new-listing` | POST | Create a vehicle listing |
| `/api/auction-start` | POST | Start a seller's upcoming auction |
| `/api/place-bid` | POST | Place a bid on a live auction |
| `/api/auction-end` | POST | Seller-triggered auction ending |
| `/api/auction-finalize` | POST | Finalize an expired auction |
| `/api/cron/finalize-auctions` | GET | Finalize expired auctions in a batch |
| `/api/comments` | POST | Add a listing comment |
| `/api/update-watchlist` | POST | Update the current user's watchlist |
| `/api/listing-view` | POST | Record a listing view |
| `/api/cloudinary-images` | GET, POST | Read saved listing images or attach an uploaded image |
| `/api/listing/[id]/cover-image` | POST | Update a listing's cover image |

Image uploads use Cloudinary widgets. New listings include the uploaded photo URLs in `/api/new-listing`; adding photos to an existing listing saves them through `/api/cloudinary-images`. The gallery renders saved images supplied by the listing page without a second image-list request.

Application-owned API failures return JSON with an `error` string and an appropriate HTTP status. Malformed JSON, non-object bodies, and invalid fields return `400`; unexpected failures return `500` with a public message while details are logged on the server. Partial cron failures retain the batch summary and add an `error` string. NextAuth's authentication endpoints use their own protocol.

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

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/notifications` | GET | Current account's paginated inbox; `view=unread` filters unread records; `cursor=<id>` loads older events; `summary=1` returns only account ID and unread count |
| `/api/notifications` | PATCH | Mark owned records read using `{ "ids": ["<id>"] }`, or mark older records using `{ "all": true, "before": "<ISO timestamp>" }` |
| `/api/pusher/auth` | POST | Authorize the signed-in account's `private-user-<id>` channel; accepts Pusher's form-encoded `socket_id` and `channel_name` |
| `/api/account/notification-preferences` | PATCH | Save the current account’s `{ "outbidEmailsEnabled": true/false }` preference |

## Deployment

1. Configure the environment variables on the deployment platform. Set `NEXTAUTH_URL` and OAuth callbacks to the production origin.
2. Ensure the deployment can reach MongoDB, Cloudinary, and Pusher.
3. Build the app with `npm run build`, which generates the Prisma client before running the Next.js production build. On Vercel, use `npm run build` as the Build Command. Synchronize reviewed schema changes with the target database using `npx prisma db push`.
4. On a Node.js host, run `npm start` to serve the build.
5. Configure both scheduled jobs. For Vercel, use the included schedules and a plan that supports their one-minute frequency. On another host, schedule authenticated GET requests to `/api/cron/finalize-auctions` and `/api/cron/send-notification-emails` every minute. Configure Resend and apply the updated Prisma schema before enabling email delivery.

Local development does not run the Vercel schedule automatically. To exercise the cron route locally, send the same authenticated GET request using your configured `CRON_SECRET`.

## Troubleshooting

- **Prisma cannot find `DATABASE_URL`:** Put it in the root `.env`; a value only in `.env.local` is not automatically loaded by the Prisma 6 CLI.
- **MongoDB transaction errors:** Check that the database runs as a replica set and that the connection string, database user, and network access are correct.
- **Uploads fail:** Check the Cloudinary cloud name and the unsigned `auctions` preset.
- **Live updates are missing:** Verify the Pusher app credentials and the `us2` cluster setting in both client and server configuration.
- **OAuth sign-in fails:** Check provider credentials and the callback URL for the current origin.
- **Auctions remain live after expiry:** Check the scheduler and its authorization header. The cron endpoint returns `401` when `CRON_SECRET` is absent or the header does not match.
- **Outbid emails are missing:** Check Resend credentials, verified sender, `NEXTAUTH_URL`, the email scheduler, and the account’s email preference. Inspect notification delivery fields with Prisma Studio: `PENDING` waits for its next attempt, `SENDING` has a recoverable lease, and `FAILED`/`SKIPPED` retain a reason code. A successful provider request is not proof of inbox delivery; inspect the Resend dashboard for delivery and bounce status.
- **Editor cannot load the Vercel schema:** `https://openapi.vercel.sh/vercel.json` is the official schema URL and is reachable from this development environment. Check editor network/proxy access and retry the JSON schema download. The current upstream schema also declares draft-04 while using numeric `exclusiveMinimum` from later drafts; strict draft-04 validators reject that schema, which may explain some editor warnings. The current configuration passes its constraints when evaluated with draft-07 keyword semantics.

## License

This project is private and proprietary.
