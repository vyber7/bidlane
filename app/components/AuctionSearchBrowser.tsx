"use client";

import { Listing, User } from "@prisma/client";
import { useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import Listings from "./Listings";

interface AuctionSearchBrowserProps {
  listings: Listing[];
  currentUser: User | null;
  auctionType: string;
}

const AuctionSearchBrowser: React.FC<AuctionSearchBrowserProps> = ({
  listings,
  currentUser,
  auctionType,
}) => {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;

  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return listings;
    }

    return listings.filter((listing) =>
      [
        listing.year,
        listing.make,
        listing.model,
        listing.location,
        listing.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [listings, query]);

  return (
    <>
      <div className="mt-5 border-b border-slate-200 pb-6">
        <label className="relative block w-full sm:max-w-80">
          <span className="sr-only">Search {auctionType} auctions</span>
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${auctionType} auctions`}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </label>
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
        <Listings listings={visibleListings} currentUser={currentUser} />
      )}
    </>
  );
};

export default AuctionSearchBrowser;
