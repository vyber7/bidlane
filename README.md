# Car Auctions Platform

A modern, real-time car auction platform built with Next.js 16, React 19, TypeScript, Prisma, and Pusher for live updates. Users can browse, bid, and sell vehicles in real-time auctions with live countdown timers and instant notifications.

## 🌟 Features

- **Real-Time Auctions**: Live countdown timers and instant bid updates using Pusher
- **User Authentication**: NextAuth.js integration with email/password and OAuth support
- **Auction Management**: Create and manage vehicle listings, set starting bids and reserve prices
- **Bidding System**: Place bids with real-time updates to all viewers
- **Watchlist**: Save and track favorite listings
- **Comments & Discussion**: Community engagement on each listing
- **Image Management**: Cloudinary integration for vehicle uploads and optimization
- **Responsive Design**: Fully responsive UI with Tailwind CSS
- **User Accounts**: Personalized dashboard with bid history and uploaded listings

## 🛠 Tech Stack

### Frontend

- **Next.js 16** - React framework with App Router and Turbopack
- **React 19** - Component and rendering library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **React Icons** - Icon library
- **React Hook Form** - Form management

### Backend & Services

- **Next.js API Routes** - Serverless endpoints
- **Prisma ORM** - Database management
- **MongoDB** - NoSQL database
- **NextAuth.js** - Authentication
- **Pusher** - Real-time broadcasting
- **Cloudinary** - Image hosting

## 📋 Prerequisites

- Node.js 20.9+
- MongoDB database (local or cloud)
- Cloudinary account
- Pusher account

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd app-car-auctions
npm install
```

### 2. Setup Environment Variables

Create `.env.local`:

```env
# Database
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/car-auctions

# NextAuth
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Pusher
NEXT_PUBLIC_PUSHER_APP_KEY=your-app-key
PUSHER_APP_ID=your-app-id
PUSHER_SECRET=your-secret

# Secures the automatic auction-finalization job (16+ random characters)
CRON_SECRET=your-random-cron-secret

# OAuth (Optional)
GITHUB_ID=your-github-id
GITHUB_SECRET=your-github-secret
```

### 3. Initialize Database

```bash
npx prisma migrate dev
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```TypeScript
app-car-auctions/
├── app/
│   ├── api/                 # API routes
│   ├── components/          # Reusable React components
│   ├── hooks/               # Custom React hooks
│   ├── libs/                # Utilities (Prisma, Pusher, Cloudinary)
│   ├── actions/             # Server actions
│   ├── (site)/              # Public pages
│   ├── listing/             # Listing detail pages
│   ├── account/             # User dashboard
│   ├── signin/              # Auth pages
│   └── ...
├── prisma/
│   └── schema.prisma        # Database schema
├── public/                  # Static assets
└── package.json
```

## 🏃 Available Commands

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm start           # Start production server
npm test            # Run the test suite once
npm run test:watch  # Run tests in watch mode
npm run lint        # Run linter

# Prisma commands
npx prisma studio  # Open Prisma Studio (UI for database)
npx prisma migrate dev --name <name>  # Create migration
npx prisma migrate reset               # Reset database
```

## 🔌 Key API Endpoints

| Endpoint                  | Method   | Description           |
| ------------------------- | -------- | --------------------- |
| `/api/auth/[...nextauth]` | POST     | Authentication        |
| `/api/place-bid`          | POST     | Submit a bid          |
| `/api/auction-start`      | POST     | Start an auction      |
| `/api/auction-end`        | POST     | End an auction        |
| `/api/comments`           | POST/GET | Manage comments       |
| `/api/update-watchlist`   | POST     | Update watchlist      |
| `/api/upload-image`       | POST     | Upload vehicle images |
| `/api/cloudinary-images`  | GET      | Retrieve images       |

## 🔄 Real-Time Features

The app uses **Pusher** for real-time updates:

- **Live Bid Updates**: All viewers see new bids instantly
- **Countdown Timers**: Real-time auction countdown displays
- **Timer Extension**: Automatically extends auction by 2 minutes when bid placed within 2 minutes of end
- **Automatic Finalization**: Ends expired auctions every minute and publishes the result in real time
- **Comments**: Live comment feed with instant notifications

## 🎯 Core Custom Hooks

### `useCountDown(targetDate, listingId)`

Provides real-time countdown display with Pusher integration for auction timer updates.

```tsx
const timeLeft = useCountDown(listing.auctionEndsAt, listing.id);
```

### `useListing()`

Gets the current listing ID from URL parameters.

```tsx
const listingId = useListing();
```

## 🗄 Database Models

- **User** - User profiles, authentication, watchlists, bids
- **Listing** - Vehicle details, auction info, images, status
- **Bid** - Bid records with amounts and timestamps
- **Comment** - Community comments on listings
- **Account** - OAuth account linking

See `prisma/schema.prisma` for the complete schema.

## 🔐 Authentication

- **NextAuth.js**: Email/password and OAuth authentication
- **Password Security**: Bcrypt hashing for secure storage
- **Session Management**: Secure, HTTP-only session cookies
- **OAuth Providers**: Support for GitHub, Google, and more

## 📸 Image Management

- **Cloudinary Integration**: Cloud-based image storage
- **Automatic Optimization**: Images automatically optimized for web
- **Responsive Delivery**: Images served at optimal sizes for each device
- **Next.js Image Component**: Built-in performance optimization

## 🐛 Common Issues

### Hydration Mismatch

Ensure server and client rendering are identical. Use `useEffect` for client-only logic.

### Pusher Channel Issues

Each component subscribes to its specific listing channel to avoid cross-updates.

### MongoDB Connection

Verify `DATABASE_URL` is correctly set in `.env.local`.

## 📝 Development Guidelines

- Use TypeScript for type safety
- Create reusable components in `/app/components`
- Use custom hooks for shared logic
- Keep API routes focused and modular
- Use Prisma for all database operations

## 🚀 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push

The included Vercel Cron schedule finalizes expired auctions every minute and
requires a Pro or Enterprise plan. Set `CRON_SECRET` in the project environment;
Vercel sends it to the protected cron endpoint automatically. Active listing
pages also request finalization when their countdown reaches zero.

### Other Platforms

- Ensure Node.js 20.9+ is available
- Set all environment variables
- Run `npm run build` before starting

## 📄 License

This project is private and proprietary.

## 📞 Support

For issues or questions, please refer to the documentation or create an issue in the repository.
