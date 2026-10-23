import type { Listing } from "@prisma/client";

export type AuctionStatus = "ALL" | "LIVE" | "UPCOMING" | "ENDED";

export const auctionSortOptions = [
  { value: "newest", label: "Newest listings" },
  { value: "ending-soon", label: "Ending soon" },
  { value: "bid-low", label: "Bid: low to high" },
  { value: "bid-high", label: "Bid: high to low" },
  { value: "mileage-low", label: "Lowest mileage" },
] as const;

export type AuctionSort = (typeof auctionSortOptions)[number]["value"];

export interface AuctionFilters {
  q: string;
  status: AuctionStatus;
  sort: AuctionSort;
}

export function readAuctionFilters(params: Pick<URLSearchParams, "get">): AuctionFilters {
  const status = params.get("status")?.toUpperCase();
  const sort = params.get("sort");

  return {
    q: params.get("q") ?? "",
    status: status === "LIVE" || status === "UPCOMING" || status === "ENDED" ? status : "ALL",
    sort: auctionSortOptions.find((option) => option.value === sort)?.value ?? "newest",
  };
}

// Keep other query parameters intact and omit defaults from shareable URLs.
export function updateAuctionParams(params: URLSearchParams, updates: Partial<AuctionFilters>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (!value || (key === "status" && value === "ALL") || (key === "sort" && value === "newest")) {
      next.delete(key);
    } else {
      next.set(key, key === "status" ? value.toLowerCase() : value);
    }
  }
  return next;
}

function compareOptionalNumbers(a: number | null, b: number | null, descending = false) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

function bidAmount(listing: Listing) {
  return listing.status === "ENDED" ? listing.currentBid : listing.currentBid ?? listing.startingBid;
}

export function filterAndSortAuctions(listings: Listing[], filters: AuctionFilters) {
  const query = filters.q.trim().toLowerCase();
  const visible = listings.filter((listing) => {
    if (filters.status !== "ALL" && listing.status !== filters.status) return false;
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
