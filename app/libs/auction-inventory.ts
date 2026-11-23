import type { PublicListing } from "@/app/libs/listing-payload";

export const inventoryTabs = ["LIVE", "NO_RESERVE", "UPCOMING", "ENDED"] as const;
export type InventoryTab = (typeof inventoryTabs)[number];
export const defaultInventoryTab: InventoryTab = "LIVE";

const pageSize = 24;

export const auctionSortOptions = [
  { value: "newest", label: "Newest listings" },
  { value: "ending-soon", label: "Ending soon" },
  { value: "bid-low", label: "Bid: low to high" },
  { value: "bid-high", label: "Bid: high to low" },
  { value: "mileage-low", label: "Lowest mileage" },
] as const;

export type AuctionSort = (typeof auctionSortOptions)[number]["value"];

interface InventoryFilters {
  q: string;
  status: InventoryTab;
  sort: AuctionSort;
}

type InventoryLocation = InventoryFilters & { page: number };

export function readAuctionInventory(params: Pick<URLSearchParams, "get">): InventoryLocation {
  const status = params.get("status")?.toUpperCase();
  const sort = params.get("sort");
  const requestedPage = Number(params.get("page"));

  return {
    q: params.get("q") ?? "",
    status: inventoryTabs.find((tab) => tab === status) ?? defaultInventoryTab,
    sort: auctionSortOptions.find((option) => option.value === sort)?.value ?? "newest",
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function updateInventoryParams(params: URLSearchParams, updates: Partial<InventoryFilters> | { page: number }) {
  const next = new URLSearchParams(params);
  if ("page" in updates) {
    if (updates.page === 1) next.delete("page");
    else next.set("page", String(updates.page));
    return next;
  }

  if (updates.status !== undefined) next.set("status", updates.status.toLowerCase());
  if (updates.sort === "newest") next.delete("sort");
  else if (updates.sort !== undefined) next.set("sort", updates.sort);
  if (updates.q === "") next.delete("q");
  else if (updates.q !== undefined) next.set("q", updates.q);
  if (next.toString() !== params.toString()) next.delete("page");
  return next;
}

export function inventoryHref(status: InventoryTab) {
  const params = updateInventoryParams(new URLSearchParams(), { status });
  return `/?${params}#auctions`;
}

function matchesTab(listing: PublicListing, status: InventoryTab) {
  return status === "NO_RESERVE" ? listing.isNoReserve : listing.status === status;
}

export function countInventoryTabs(listings: PublicListing[]) {
  return {
    LIVE: listings.filter((listing) => matchesTab(listing, "LIVE")).length,
    NO_RESERVE: listings.filter((listing) => matchesTab(listing, "NO_RESERVE")).length,
    UPCOMING: listings.filter((listing) => matchesTab(listing, "UPCOMING")).length,
    ENDED: listings.filter((listing) => matchesTab(listing, "ENDED")).length,
  } satisfies Record<InventoryTab, number>;
}

export function inventoryPage(results: PublicListing[], requestedPage: number) {
  const pageCount = Math.ceil(results.length / pageSize);
  const page = Math.min(requestedPage, pageCount || 1);
  const start = (page - 1) * pageSize;
  return {
    listings: results.slice(start, start + pageSize),
    page,
    pageCount,
    previousPage: page > 1 ? page - 1 : null,
    nextPage: page < pageCount ? page + 1 : null,
  };
}

function compareOptionalNumbers(a: number | null, b: number | null, descending = false) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

function bidAmount(listing: PublicListing) {
  return listing.status === "ENDED" ? listing.currentBid : listing.currentBid ?? listing.startingBid;
}

export function filterAndSortAuctions(listings: PublicListing[], filters: InventoryFilters) {
  const query = filters.q.trim().toLowerCase();
  const visible = listings.filter((listing) => {
    if (!matchesTab(listing, filters.status)) return false;
    return !query || [listing.year, listing.make, listing.model, listing.location, listing.description]
      .join(" ").toLowerCase().includes(query);
  });

  return visible.sort((a, b) => {
    let order = 0;
    switch (filters.sort) {
      case "ending-soon":
        // Auctions accepting bids come first; unscheduled and ended listings follow.
        order = compareOptionalNumbers(
          a.status === "LIVE" && a.auctionEndsAt ? new Date(a.auctionEndsAt).getTime() : null,
          b.status === "LIVE" && b.auctionEndsAt ? new Date(b.auctionEndsAt).getTime() : null,
        );
        break;
      case "bid-low":
      case "bid-high":
        order = compareOptionalNumbers(
          bidAmount(a),
          bidAmount(b),
          filters.sort === "bid-high",
        );
        break;
      case "mileage-low":
        order = a.miles - b.miles;
        break;
    }
    return order || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id);
  });
}
