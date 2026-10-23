"use client";

import { useSearchParams } from "next/navigation";
import { readAuctionFilters, updateAuctionParams, type AuctionFilters } from "@/app/libs/auction-filters";

export default function useAuctionFilters() {
  const searchParams = useSearchParams();
  const filters = readAuctionFilters(searchParams);

  function updateFilters(updates: Partial<AuctionFilters>, replace = false) {
    // Read the latest URL so rapid interactions never overwrite each other.
    const url = new URL(window.location.href);
    url.search = updateAuctionParams(url.searchParams, updates).toString();
    if (url.href === window.location.href) return;

    // Next.js syncs native history updates with useSearchParams without refetching listings.
    window.history[replace ? "replaceState" : "pushState"](null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return {
    ...filters,
    setQuery: (q: string) => updateFilters({ q }, true),
    setStatus: (status: AuctionFilters["status"]) => updateFilters({ status }),
    setSort: (sort: AuctionFilters["sort"]) => updateFilters({ sort }),
  };
}
