import { getReadRepositories } from "../libs/read-repositories";
import getCurrentUser from "../actions/getCurrentUser";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import AuctionBrowser from "./components/AuctionBrowser";
import FeaturedAuction from "./components/FeaturedAuction";
import LatestBids from "./components/LatestBids";
import WatchAuctionButton from "./components/WatchAuctionButton";
import { toPublicListing } from "../libs/listing-codec";
import { homeSpotlight, inventoryHref, type InventoryTab } from "../libs/auction-inventory";

export const dynamic = "force-dynamic";

const heroStats: { tab: InventoryTab; label: string }[] = [
  { tab: "LIVE", label: "Live now" },
  { tab: "NO_RESERVE", label: "No reserve" },
  { tab: "UPCOMING", label: "Coming soon" },
  { tab: "ENDED", label: "Results" },
];

const browseLabels = {
  LIVE: "Browse Live Auctions",
  UPCOMING: "Explore coming soon",
  ENDED: "Explore auction results",
} satisfies Partial<Record<InventoryTab, string>>;

/**
 * Reads the public inventory and notes when it was read. The whole page, and
 * the browser after hydration, judge every Auction phase at that one moment.
 */
async function readHomeInventory() {
  const repositories = getReadRepositories();
  const [publicListings, currentUser] = await Promise.all([
    repositories.listings.public(),
    getCurrentUser(),
  ]);
  const latestBids = await repositories.bids.latestForListings(publicListings);
  return { publicListings, currentUser, latestBids, now: Date.now() };
}

export default async function Home() {
  const { publicListings, currentUser, latestBids, now } = await readHomeInventory();
  const listings = publicListings.map((listing) => toPublicListing(listing, currentUser?.id));
  const { featured, comingNext, counts, browse: browseTab } = homeSpotlight(listings, now);
  const browse = browseTab
    ? { href: inventoryHref(browseTab), label: browseLabels[browseTab] }
    : { href: "#auctions", label: "Browse Auctions" };

  return (
    <div className="bg-stone-50 pb-16 pt-[var(--site-nav-height)]">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.18),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12 lg:px-8">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> Enthusiast car auctions
            </p>
            <h1 className="max-w-xl text-balance text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              Great cars. Worth the chase.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
              Discover enthusiast cars, follow the bidding, and make your next
              great drive yours.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={browse.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-400 px-4 py-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 sm:px-5 sm:text-sm"
              >
                {browse.label} <FiArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/submit-listing"
                className="inline-flex min-h-11 items-center rounded-full px-1 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:border sm:border-white/25 sm:px-4 sm:text-sm"
              >
                Sell Your Vehicle
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-2">
            <nav aria-label="Auctions by status">
              <ul className="grid grid-cols-2 gap-2">
                {heroStats.map(({ tab, label }) => (
                  <li key={tab}>
                    <Link
                      href={inventoryHref(tab)}
                      className="group flex min-h-11 flex-col rounded-xl px-3 py-3 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <span className="text-3xl font-black tabular-nums tracking-tight">
                        {counts[tab]}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300 group-hover:text-amber-400 sm:text-sm">
                        {label} <FiArrowRight aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {comingNext && (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/15 px-3 pb-2 pt-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-400">
                    Coming next
                  </p>
                  <Link
                    href={`/listing/${comingNext.id}`}
                    className="mt-1 block truncate text-sm font-semibold hover:text-amber-400"
                  >
                    {comingNext.year} {comingNext.make} {comingNext.model}
                  </Link>
                </div>
                <WatchAuctionButton
                  key={comingNext.id}
                  listing={comingNext}
                  currentUserId={currentUser?.id}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-8 sm:px-6 lg:px-8">
        {featured ? (
          <FeaturedAuction
            key={featured.id}
            listing={featured}
            currentUserId={currentUser?.id}
          />
        ) : (
          <div className="rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              The next chapter
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Have a Car Worth Sharing?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Bring your vehicle to BidLane and help build the next lineup of
              enthusiast favorites.
            </p>
            <Link
              href="/submit-listing"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-400 hover:text-amber-300"
            >
              List Your Vehicle <FiArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}

        <LatestBids bids={latestBids} />

        <section
          id="auctions"
          tabIndex={-1}
          aria-labelledby="inventory-title"
        >
          <h2 id="inventory-title" className="text-lg font-bold tracking-tight text-slate-950">
            Inventory
          </h2>

          <AuctionBrowser listings={listings} now={now} currentUserId={currentUser?.id} />
        </section>
      </div>
    </div>
  );
}
