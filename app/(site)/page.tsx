import prisma from "../libs/prismadb";
import getCurrentUser from "../actions/getCurrentUser";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import AuctionBrowser from "./components/AuctionBrowser";
import FeaturedAuction from "./components/FeaturedAuction";
import { getHomeSpotlight } from "../libs/featured-auction";
import WatchAuctionButton from "./components/WatchAuctionButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [listings, currentUser] =
    await Promise.all([
      prisma.listing.findMany({ orderBy: { createdAt: "desc" } }),
      getCurrentUser(),
    ]);
  const { featured, live, upcoming } = getHomeSpotlight(listings);
  const comingNext = !live && featured?.status !== "UPCOMING" ? upcoming : null;
  const browse = live
    ? { href: "/?status=live#auctions", label: "Browse live auctions" }
    : upcoming
      ? { href: "/?status=upcoming#auctions", label: "Explore coming soon" }
      : featured?.status === "ENDED"
        ? { href: "/?status=ended#auctions", label: "Explore auction results" }
        : { href: "#auctions", label: "Browse auctions" };

  return (
    <div className="bg-stone-50 pb-16 pt-16">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.18),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-7 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-12 lg:px-8">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> Curated enthusiast cars
            </p>
            <h1 className="max-w-xl text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              Find the car you&apos;ll talk about for years.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
              Discover exceptional vehicles, watch your favorites, and follow the bidding from first look to final call.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={browse.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 sm:px-5 sm:text-sm">
                {browse.label} <FiArrowRight aria-hidden="true" />
              </Link>
              <Link href="/submit-listing" className="inline-flex min-h-11 items-center rounded-full px-1 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:border sm:border-white/25 sm:px-4 sm:text-sm">
                Sell your vehicle
              </Link>
            </div>
            {comingNext && (
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/15 pt-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-400">Coming next</p>
                  <Link href={`/listing/${comingNext.id}`} className="mt-1 block truncate text-sm font-semibold hover:text-amber-400">{comingNext.year} {comingNext.make} {comingNext.model}</Link>
                </div>
                <WatchAuctionButton key={comingNext.id} listing={comingNext} currentUserId={currentUser?.id} />
              </div>
            )}
          </div>
          {featured ? <FeaturedAuction key={featured.id} listing={featured} currentUserId={currentUser?.id} /> : (
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">The next chapter</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">Have a car worth sharing?</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Bring your vehicle to BidLane and help build the next lineup of enthusiast favorites.</p>
              <Link href="/submit-listing" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-400 hover:text-amber-300">List your vehicle <FiArrowRight aria-hidden="true" /></Link>
            </div>
          )}
        </div>
      </section>

      <section id="auctions" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">The lineup</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">All auctions</h2>
            <p className="mt-2 text-sm text-slate-500">Fresh listings, live bids, and recently completed sales.</p>
          </div>
          <Link href="/submit-listing" className="hidden items-center gap-2 text-sm font-bold text-slate-700 hover:text-amber-600 sm:flex">
            Have a great car? List it <FiArrowRight />
          </Link>
        </div>

        <AuctionBrowser listings={listings} currentUserId={currentUser?.id} />
      </section>
    </div>
  );
}
