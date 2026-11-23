"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useMemo, useOptimistic } from "react";
import {
  countInventoryTabs,
  filterAndSortAuctions,
  inventoryPage,
  readAuctionInventory,
  updateInventoryParams,
  type AuctionSort,
  type InventoryTab,
} from "@/app/libs/auction-inventory";
import type { PublicListing } from "@/app/libs/listing-payload";

function navigateInventory(updates: Parameters<typeof updateInventoryParams>[1], mode: "push" | "replace" = "push") {
  // Read the current location so rapid interactions preserve each other's changes.
  const url = new URL(window.location.href);
  const params = updateInventoryParams(url.searchParams, updates);
  if (params.toString() === url.searchParams.toString()) return;

  url.search = params.toString();
  const href = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "replace") window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
}

export default function useAuctionInventory(listings: PublicListing[]) {
  const searchParams = useSearchParams();
  const { status, sort, page, q } = useMemo(() => readAuctionInventory(searchParams), [searchParams]);
  const [query, setOptimisticQuery] = useOptimistic(q);

  const counts = useMemo(() => countInventoryTabs(listings), [listings]);
  const results = useMemo(
    () => filterAndSortAuctions(listings, { status, sort, q: query }),
    [listings, status, sort, query],
  );

  return {
    activeTab: status,
    counts,
    query,
    sort,
    resultCount: results.length,
    resultsPage: inventoryPage(results, page),
    setQuery: (q: string) => {
      startTransition(() => {
        setOptimisticQuery(q);
        navigateInventory({ q }, "replace");
      });
    },
    setStatus: (nextStatus: InventoryTab) => navigateInventory({ status: nextStatus }),
    setSort: (nextSort: AuctionSort) => navigateInventory({ sort: nextSort }),
    setPage: (nextPage: number) => navigateInventory({ page: nextPage }),
  };
}
