"use client";

import { Listing } from "@prisma/client";
import { useMemo } from "react";
import { FiCheckCircle, FiClock, FiSearch, FiZap } from "react-icons/fi";
import Listings from "../../components/Listings";
import AuctionSearchControls from "@/app/components/AuctionSearchControls";
import useAuctionFilters from "@/app/hooks/useAuctionFilters";
import { filterAndSortAuctions, type AuctionStatus } from "@/app/libs/auction-filters";

interface AuctionBrowserProps {
  listings: Listing[];
  currentUserId?: string | null;
}

const tabs: {
  id: AuctionStatus;
  label: string;
  icon: typeof FiCheckCircle;
}[] = [
  { id: "LIVE", label: "Live", icon: FiZap },
  { id: "NO_RESERVE", label: "No reserve", icon: FiCheckCircle },
  { id: "UPCOMING", label: "Coming soon", icon: FiClock },
  { id: "ENDED", label: "Results", icon: FiCheckCircle },
];

const AuctionBrowser: React.FC<AuctionBrowserProps> = ({
  listings,
  currentUserId,
}) => {
  const { status, q: query, sort, setQuery, setStatus, setSort } = useAuctionFilters();

  const activeTab = status === "ALL" ? "LIVE" : status;

  const counts = useMemo(
    () => ({
      NO_RESERVE: listings.filter((listing) => listing.reservePrice === null).length,
      LIVE: listings.filter((listing) => listing.status === "LIVE").length,
      UPCOMING: listings.filter((listing) => listing.status === "UPCOMING").length,
      ENDED: listings.filter((listing) => listing.status === "ENDED").length,
    }),
    [listings]
  );

  const visibleListings = useMemo(
    () => filterAndSortAuctions(listings, { status: activeTab, q: query, sort }),
    [activeTab, listings, query, sort],
  );

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label;

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-center xl:justify-between">
        <div
          className="flex min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filter auctions"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab;

            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(id)}
                className={`flex min-h-11 shrink-0 snap-start items-center justify-between gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition sm:justify-start sm:gap-3 sm:px-4 sm:text-sm ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
                }`}
              >
                <span className="flex items-center gap-1 whitespace-nowrap sm:gap-2">
                  <Icon className={`shrink-0 ${id === "LIVE" ? "text-amber-500" : ""}`} />
                  {label}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs sm:px-2 ${
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>

        <AuctionSearchControls
          auctionType={activeLabel ?? "all"}
          query={query}
          sort={sort}
          onQueryChange={setQuery}
          onSortChange={setSort}
        />
      </div>

      {visibleListings.length > 0 ? (
        <Listings listings={visibleListings} currentUserId={currentUserId} />
      ) : (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
          <FiSearch className="mx-auto text-2xl text-slate-400" />
          <h3 className="mt-3 font-bold text-slate-950">No auctions found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try another search or choose a different auction tab.
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 text-sm font-bold text-slate-950 hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default AuctionBrowser;
