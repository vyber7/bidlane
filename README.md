# Bidlane

Bidlane is a vehicle auction app built with Next.js, React, TypeScript, and MongoDB. Buyers can browse upcoming, live, and past auctions, follow listings, and bid with live updates. Sellers can submit vehicles, manage photos, and run auctions from their accounts.

## Features

- **Auction browsing:** Search and filter vehicle listings, view photo galleries, and follow live countdowns.
- **Live bidding:** Pusher broadcasts bids, auction status changes, comments, and countdown extensions.
- **Seller tools:** Create listings with reserve prices, manage gallery and cover images, and start auctions with a starting bid, bid increment, and end time.
- **Accounts:** Email/password registration and sign-in, plus GitHub and Google OAuth.
- **Personal dashboards:** Manage listings and watchlists, review bids and wins, edit profiles, and view auction activity notifications.
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

Use Node.js **20.9 or newer** and npm. From your checkout:

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

Tests live alongside the implementation as `*.test.ts` files and run in Vitest's Node environment. Coverage includes auction transitions, bid validation, finalization, API authorization, and data helpers.

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
├── context/         # Authentication and toast providers
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

Image uploads use Cloudinary widgets. The `/api/upload-image` and `/api/add-images` routes are placeholders that echo an image URL; they do not upload files or persist images.

## Deployment

1. Configure the environment variables on the deployment platform. Set `NEXTAUTH_URL` and OAuth callbacks to the production origin.
2. Ensure the deployment can reach MongoDB, Cloudinary, and Pusher.
3. Generate the Prisma client and build the app with `npx prisma generate` followed by `npm run build`. Synchronize reviewed schema changes with the target database using `npx prisma db push`.
4. On a Node.js host, run `npm start` to serve the build.
5. Configure scheduled finalization. For Vercel, use the included schedule and a plan that supports its one-minute frequency. On another host, schedule an authenticated GET request to `/api/cron/finalize-auctions` every minute.

Local development does not run the Vercel schedule automatically. To exercise the cron route locally, send the same authenticated GET request using your configured `CRON_SECRET`.

## Troubleshooting

- **Prisma cannot find `DATABASE_URL`:** Put it in the root `.env`; a value only in `.env.local` is not automatically loaded by the Prisma 6 CLI.
- **MongoDB transaction errors:** Check that the database runs as a replica set and that the connection string, database user, and network access are correct.
- **Uploads fail:** Check the Cloudinary cloud name and the unsigned `auctions` preset.
- **Live updates are missing:** Verify the Pusher app credentials and the `us2` cluster setting in both client and server configuration.
- **OAuth sign-in fails:** Check provider credentials and the callback URL for the current origin.
- **Auctions remain live after expiry:** Check the scheduler and its authorization header. The cron endpoint returns `401` when `CRON_SECRET` is absent or the header does not match.

## License

This project is private and proprietary.
