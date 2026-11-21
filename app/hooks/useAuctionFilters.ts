"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { readAuctionFilters, updateAuctionParams, type AuctionFilters } from "@/app/libs/auction-filters";

export default function useAuctionFilters() {
  const searchParams = useSearchParams();
  const filters = readAuctionFilters(searchParams);
  const [query, setOptimisticQuery] = useOptimistic(filters.q);

  function updateFilters(updates: Partial<AuctionFilters>, replace = false) {
    // Read the latest URL so rapid interactions never overwrite each other.
    const url = new URL(window.location.href);
    url.search = updateAuctionParams(url.searchParams, updates).toString();
    if (url.href === window.location.href) return;

    const href = `${url.pathname}${url.search}${url.hash}`;
    if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
  }

  return {
    ...filters,
    q: query,
    setQuery: (q: string) => {
      // Keep the controlled input responsive while Next.js syncs the URL.
      startTransition(() => {
        setOptimisticQuery(q);
        updateFilters({ q }, true);
      });
    },
    setStatus: (status: AuctionFilters["status"]) => updateFilters({ status }),
    setSort: (sort: AuctionFilters["sort"]) => updateFilters({ sort }),
  };
}
