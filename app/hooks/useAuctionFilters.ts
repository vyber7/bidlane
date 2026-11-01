"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { readAuctionFilters, updateAuctionParams, type AuctionFilters } from "@/app/libs/auction-filters";

export default function useAuctionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = readAuctionFilters(searchParams);

  function updateFilters(updates: Partial<AuctionFilters>, replace = false) {
    // Read the latest URL so rapid interactions never overwrite each other.
    const url = new URL(window.location.href);
    url.search = updateAuctionParams(url.searchParams, updates).toString();
    if (url.href === window.location.href) return;

    const href = `${url.pathname}${url.search}${url.hash}`;
    if (replace) {
      router.replace(href, { scroll: false });
    } else {
      router.push(href, { scroll: false });
    }
  }

  return {
    ...filters,
    setQuery: (q: string) => updateFilters({ q }, true),
    setStatus: (status: AuctionFilters["status"]) => updateFilters({ status }),
    setSort: (sort: AuctionFilters["sort"]) => updateFilters({ sort }),
  };
}
