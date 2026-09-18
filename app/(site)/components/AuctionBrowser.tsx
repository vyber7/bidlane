"use client";

import { Listing } from "@prisma/client";
import { useMemo, useState } from "react";
import { FiCheckCircle, FiClock, FiSearch, FiZap } from "react-icons/fi";
import Listings from "../../components/Listings";

interface AuctionBrowserProps {
  listings: Listing[];
  currentUserId?: string | null;
}

type AuctionTab = "ALL" | "LIVE" | "UPCOMING" | "ENDED";

const tabs: {
  id: AuctionTab;
  label: string;
  icon: typeof FiCheckCircle;
}[] = [
  { id: "ALL", label: "All", icon: FiCheckCircle },
  { id: "LIVE", label: "Live", icon: FiZap },
  { id: "UPCOMING", label: "Coming soon", icon: FiClock },
  { id: "ENDED", label: "Results", icon: FiCheckCircle },
];

const AuctionBrowser: React.FC<AuctionBrowserProps> = ({
  listings,
  currentUserId,
}) => {
  const [activeTab, setActiveTab] = useState<AuctionTab>("ALL");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      ALL: listings.length,
      LIVE: listings.filter((listing) => listing.status === "LIVE").length,
      UPCOMING: listings.filter((listing) => listing.status === "UPCOMING").length,
      ENDED: listings.filter((listing) => listing.status === "ENDED").length,
    }),
    [listings]
  );

  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return listings.filter((listing) => {
      const matchesTab = activeTab === "ALL" || listing.status === activeTab;
      const searchable = [
        listing.year,
        listing.make,
        listing.model,
        listing.location,
        listing.description,
      ]
        .join(" ")
        .toLowerCase();

      return matchesTab &&
        (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeTab, listings, query]);

  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label;

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="grid grid-cols-2 gap-2 sm:flex"
          role="tablist"
          aria-label="Filter auctions by status"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab;

            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold transition sm:justify-start ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={id === "LIVE" ? "text-amber-500" : ""} />
                  {label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
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

        <label className="relative block w-full lg:w-80">
          <span className="sr-only">Search {activeLabel} auctions</span>
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeLabel?.toLowerCase()} auctions`}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>
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
