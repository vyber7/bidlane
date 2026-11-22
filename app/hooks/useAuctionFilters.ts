"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { readAuctionFilters, updateAuctionParams, type AuctionFilters } from "@/app/libs/auction-filters";

export default function useAuctionFilters() {
  const searchParams = useSearchParams();
  const filters = readAuctionFilters(searchParams);
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [query, setOptimisticQuery] = useOptimistic(filters.q);

  function updateUrl(url: URL, replace = false) {
    const href = `${url.pathname}${url.search}${url.hash}`;
    if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
  }

  function updateFilters(updates: Partial<AuctionFilters>, replace = false) {
    // Read the latest URL so rapid interactions never overwrite each other.
    const url = new URL(window.location.href);
    const params = updateAuctionParams(url.searchParams, updates);
    if (params.toString() === url.searchParams.toString()) return;

    params.delete("page");
    url.search = params.toString();
    updateUrl(url, replace);
  }

  return {
    ...filters,
    q: query,
    page,
    setQuery: (q: string) => {
      // Keep the controlled input responsive while Next.js syncs the URL.
      startTransition(() => {
        setOptimisticQuery(q);
        updateFilters({ q }, true);
      });
    },
    setStatus: (status: AuctionFilters["status"]) => updateFilters({ status }),
    setSort: (sort: AuctionFilters["sort"]) => updateFilters({ sort }),
    setPage: (nextPage: number) => {
      const url = new URL(window.location.href);
      if (nextPage === 1) url.searchParams.delete("page");
      else url.searchParams.set("page", String(nextPage));
      if (url.href !== window.location.href) updateUrl(url);
    },
  };
}
