import prisma from "../libs/prismadb";
import getCurrentUser from "../actions/getCurrentUser";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import AuctionBrowser from "./components/AuctionBrowser";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [listings, count, countFuture, countLive, currentUser] =
    await Promise.all([
      prisma.listing.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.listing.count(),
      prisma.listing.count({ where: { status: "UPCOMING" } }),
      prisma.listing.count({ where: { status: "LIVE" } }),
      getCurrentUser(),
    ]);

  return (
    <div className="bg-stone-50 pb-16 pt-12 lg:pt-14">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.18),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 md:px-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end lg:py-20">
          <div>
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> Curated enthusiast cars
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Find the car you&apos;ll talk about for years.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Bid on exceptional vehicles, discover new favorites, and follow every auction from first look to final call.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#auctions" className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300">
                Browse auctions <FiArrowRight />
              </a>
              <Link href="/submit-listing" className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold transition hover:border-white/60 hover:bg-white/10">
                Sell your vehicle
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
            <div className="px-3 pb-0 lg:pb-4"><strong className="block text-2xl text-amber-400">{countLive}</strong><span className="text-xs text-slate-400">Live auctions</span></div>
            <div className="px-3 lg:py-4"><strong className="block text-2xl">{countFuture}</strong><span className="text-xs text-slate-400">Coming soon</span></div>
            <div className="px-3 pt-0 lg:pt-4"><strong className="block text-2xl">{count}</strong><span className="text-xs text-slate-400">Total listings</span></div>
          </div>
        </div>
      </section>

      <section id="auctions" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-10 sm:px-6 lg:px-8">
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

        <AuctionBrowser listings={listings} currentUser={currentUser} />
      </section>
    </div>
  );
}
