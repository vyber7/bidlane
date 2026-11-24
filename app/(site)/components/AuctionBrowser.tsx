"use client";

import type { PublicListing } from "@/app/libs/listing-payload";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { FiCheckCircle, FiClock, FiSearch, FiTag, FiZap } from "react-icons/fi";
import Listings from "../../components/Listings";
import AuctionSearchControls from "@/app/components/AuctionSearchControls";
import useAuctionInventory from "@/app/hooks/useAuctionInventory";
import { inventoryTabs, type InventoryTab } from "@/app/libs/auction-inventory";

interface AuctionBrowserProps {
  listings: PublicListing[];
  /** The moment the page was rendered, so server and browser sort alike. */
  now: number;
  currentUserId?: string | null;
}

const tabDisplay = {
  LIVE: { label: "Live", icon: FiZap },
  NO_RESERVE: { label: "No reserve", icon: FiTag },
  UPCOMING: { label: "Coming soon", icon: FiClock },
  ENDED: { label: "Results", icon: FiCheckCircle },
};

const AuctionBrowser: React.FC<AuctionBrowserProps> = ({
  listings,
  now,
  currentUserId,
}) => {
  const {
    activeTab,
    counts,
    query,
    sort,
    resultCount,
    resultsPage,
    setQuery,
    setStatus,
    setSort,
    setPage,
  } = useAuctionInventory(listings, now);

  const browserId = useId();
  const tabRefs = useRef<Partial<Record<InventoryTab, HTMLButtonElement>>>({});
  const [focusedTab, setFocusedTab] = useState<InventoryTab | null>(null);
  const scrollSpaceRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ tab: InventoryTab; top: number } | null>(null);

  useLayoutEffect(() => {
    const space = scrollSpaceRef.current;
    const previous = pendingScroll.current;
    pendingScroll.current = null;
    if (!space) return;
    space.style.height = "";
    if (previous?.tab !== activeTab) return;

    const root = document.documentElement;
    const requiredHeight = Math.ceil(previous.top + root.clientHeight);
    if (root.scrollHeight < requiredHeight) {
      // A shorter result panel can move the bottom of the page past the old viewport.
      // Extend from the results to the viewport bottom, then subtract the room below them.
      const height = requiredHeight - (space.getBoundingClientRect().top + window.scrollY);
      space.style.height = `${height}px`;
      space.style.height = `${Math.max(0, height - (root.scrollHeight - requiredHeight))}px`;
    }

    if (window.scrollY !== previous.top) {
      window.scrollTo({ top: previous.top, behavior: "instant" });
    }
  }, [activeTab]);

  const activeLabel = tabDisplay[activeTab].label;
  const resultMessage = resultCount === 0
    ? "No auctions found"
    : `${resultCount} ${resultCount === 1 ? "auction" : "auctions"} found`;

  function focusTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    let nextIndex: number;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + inventoryTabs.length) % inventoryTabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % inventoryTabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = inventoryTabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabRefs.current[inventoryTabs[nextIndex]]?.focus();
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
          {inventoryTabs.map((id, index) => {
            const { label, icon: Icon } = tabDisplay[id];
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
                onClick={() => {
                  if (id !== activeTab) pendingScroll.current = { tab: id, top: window.scrollY };
                  setStatus(id);
                }}
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
          auctionType={activeLabel}
          query={query}
          sort={sort}
          onQueryChange={setQuery}
          onSortChange={setSort}
        />
      </div>

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {activeLabel}: {resultMessage}.
      </p>

      {inventoryTabs.map((id) => (
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
              <Listings resultsPage={resultsPage} currentUserId={currentUserId} onPageChange={setPage} />
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
      <div ref={scrollSpaceRef} aria-hidden="true" className="[overflow-anchor:none]" />
    </>
  );
};

export default AuctionBrowser;
