"use client";

import type { PublicListing } from "@/app/libs/listing-payload";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FiCheckCircle, FiClock, FiSearch, FiTag, FiZap } from "react-icons/fi";
import Listings from "../../components/Listings";
import AuctionSearchControls from "@/app/components/AuctionSearchControls";
import useAuctionFilters from "@/app/hooks/useAuctionFilters";
import {
  filterAndSortAuctions,
  type AuctionStatus,
} from "@/app/libs/auction-filters";

interface AuctionBrowserProps {
  listings: PublicListing[];
  currentUserId?: string | null;
}

type AuctionTab = Exclude<AuctionStatus, "ALL">;

const tabs: {
  id: AuctionTab;
  label: string;
  icon: typeof FiCheckCircle;
}[] = [
  { id: "LIVE", label: "Live", icon: FiZap },
  { id: "NO_RESERVE", label: "No reserve", icon: FiTag },
  { id: "UPCOMING", label: "Coming soon", icon: FiClock },
  { id: "ENDED", label: "Results", icon: FiCheckCircle },
];

const AuctionBrowser: React.FC<AuctionBrowserProps> = ({
  listings,
  currentUserId,
}) => {
  const {
    status,
    q: query,
    sort,
    page,
    setQuery,
    setStatus,
    setSort,
    setPage,
  } = useAuctionFilters();

  const browserId = useId();
  const tabRefs = useRef<Partial<Record<AuctionTab, HTMLButtonElement>>>({});
  const [focusedTab, setFocusedTab] = useState<AuctionTab | null>(null);
  const activeTab = status === "ALL" ? "LIVE" : status;

  const counts = useMemo(
    () => ({
      NO_RESERVE: listings.filter((listing) => listing.isNoReserve).length,
      LIVE: listings.filter((listing) => listing.status === "LIVE").length,
      UPCOMING: listings.filter((listing) => listing.status === "UPCOMING")
        .length,
      ENDED: listings.filter((listing) => listing.status === "ENDED").length,
    }),
    [listings],
  );

  const visibleListings = useMemo(
    () =>
      filterAndSortAuctions(listings, { status: activeTab, q: query, sort }),
    [activeTab, listings, query, sort],
  );

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label;
  const resultCount = visibleListings.length;
  const resultMessage = resultCount === 0
    ? "No auctions found"
    : `${resultCount} ${resultCount === 1 ? "auction" : "auctions"} found`;

  function focusTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    let nextIndex: number;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabRefs.current[tabs[nextIndex].id]?.focus();
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div
          className="flex min-w-0 max-w-full snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] xl:shrink-0 [&::-webkit-scrollbar]:h-1"
          role="tablist"
          aria-label="Filter auctions"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocusedTab(null);
          }}
        >
          {tabs.map(({ id, label, icon: Icon }, index) => {
            const active = id === activeTab;

            return (
              <button
                key={id}
                ref={(button) => {
                  if (button) tabRefs.current[id] = button;
                  else delete tabRefs.current[id];
                }}
                id={`${browserId}-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${browserId}-panel-${id}`}
                tabIndex={(focusedTab ?? activeTab) === id ? 0 : -1}
                onFocus={() => setFocusedTab(id)}
                onKeyDown={(event) => focusTab(event, index)}
                onClick={() => setStatus(id)}
                className={`flex min-h-11 shrink-0 snap-start items-center justify-between gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-600 sm:justify-start sm:gap-3 sm:px-4 sm:text-sm xl:gap-2 xl:px-3 ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
                }`}
              >
                <span className="flex items-center gap-1 whitespace-nowrap sm:gap-2">
                  <Icon
                    aria-hidden="true"
                    className={`shrink-0 ${id === "LIVE" ? "text-amber-500" : ""}`}
                  />
                  {label}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs sm:px-2 ${
                    active
                      ? "bg-white/15 text-white"
                      : "bg-slate-100 text-slate-600"
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

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {activeLabel}: {resultMessage}.
      </p>

      {tabs.map(({ id }) => (
        <div
          key={id}
          id={`${browserId}-panel-${id}`}
          role="tabpanel"
          aria-labelledby={`${browserId}-tab-${id}`}
          hidden={id !== activeTab}
          tabIndex={0}
          className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          {id === activeTab && (
            resultCount > 0 ? (
              <Listings listings={visibleListings} currentUserId={currentUserId} page={page} onPageChange={setPage} />
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
                <FiSearch aria-hidden="true" className="mx-auto text-2xl text-slate-400" />
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
            )
          )}
        </div>
      ))}
    </>
  );
};

export default AuctionBrowser;
