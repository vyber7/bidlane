"use client";

import { Listing } from "@prisma/client";
import { useMemo } from "react";
import { FiSearch } from "react-icons/fi";
import Listings from "./Listings";
import AuctionSearchControls from "./AuctionSearchControls";
import useAuctionFilters from "@/app/hooks/useAuctionFilters";
import { filterAndSortAuctions } from "@/app/libs/auction-filters";

interface AuctionSearchBrowserProps {
  listings: Listing[];
  currentUserId?: string | null;
  title: string;
  auctionType: string;
  eyebrow?: string;
  description?: string;
}

const AuctionSearchBrowser: React.FC<AuctionSearchBrowserProps> = ({
  listings,
  currentUserId,
  title,
  auctionType,
  eyebrow,
  description,
}) => {
  const { q: query, sort, setQuery, setSort } = useAuctionFilters();
  const hasQuery = query.trim().length > 0;

  const visibleListings = useMemo(
    () => filterAndSortAuctions(listings, { q: query, status: "ALL", sort }),
    [listings, query, sort],
  );

  return (
    <>
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
              {eyebrow}
            </p>
          )}
          <h2
            className={
              eyebrow
                ? "mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950"
                : "flex items-center gap-2 text-md font-bold"
            }
          >
            {title}
            <span
              aria-label={`${visibleListings.length} auctions`}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tracking-normal text-amber-800"
            >
              {visibleListings.length}
            </span>
          </h2>
          {description && (
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          )}
        </div>
        <AuctionSearchControls
          auctionType={auctionType}
          query={query}
          sort={sort}
          onQueryChange={setQuery}
          onSortChange={setSort}
        />
      </div>

      {visibleListings.length === 0 && hasQuery ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
          <FiSearch className="mx-auto text-2xl text-slate-400" />
          <h3 className="mt-3 font-bold text-slate-950">No auctions found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try another search to find an auction.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-4 text-sm font-bold text-slate-950 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <Listings listings={visibleListings} currentUserId={currentUserId} />
      )}
    </>
  );
};

export default AuctionSearchBrowser;
