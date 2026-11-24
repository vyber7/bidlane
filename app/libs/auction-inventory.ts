import type { PublicListing } from "@/app/libs/listing-payload";
import { auctionPhase } from "@/app/libs/auction-lifecycle";
import { describeAuction, type AuctionDisplay } from "@/app/libs/auction-display";

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

const bucketTabs = { live: "LIVE", upcoming: "UPCOMING", results: "ENDED" } as const satisfies
  Record<AuctionDisplay["bucket"], InventoryTab>;

/** How the homepage sees one Listing at `now`, as any anonymous visitor would. */
function describeForInventory(listing: PublicListing, now: number) {
  return describeAuction(listing, auctionPhase(listing, now), null);
}

function matchesTab(listing: PublicListing, status: InventoryTab, now: number) {
  return status === "NO_RESERVE"
    ? listing.isNoReserve
    : bucketTabs[describeForInventory(listing, now).bucket] === status;
}

export function countInventoryTabs(listings: PublicListing[], now: number) {
  const count = (tab: InventoryTab) => listings.filter((listing) => matchesTab(listing, tab, now)).length;
  return {
    LIVE: count("LIVE"),
    NO_RESERVE: count("NO_RESERVE"),
    UPCOMING: count("UPCOMING"),
    ENDED: count("ENDED"),
  } satisfies Record<InventoryTab, number>;
}

/** Featured priority: accepting bids, then other Live (Closing or blocked), then Upcoming, then Results. */
function featuredRank(listing: PublicListing, now: number) {
  const display = describeForInventory(listing, now);
  if (display.action === "place-bid") return 0;
  return { live: 1, upcoming: 2, results: 3 }[display.bucket];
}

/**
 * What the homepage hero and featured card show: the featured Listing, an
 * Upcoming Listing to tease when it is not already featured, tab counts, and
 * the first tab with Auctions for the hero's browse link.
 */
export function homeSpotlight(listings: PublicListing[], now: number) {
  // Keep real photography in the main feature; the page can promote an
  // upcoming car without photos separately in its coming-next row.
  const photographed = listings.filter((listing) => listing.coverImage || listing.images[0]);
  const featured = [...(photographed.length ? photographed : listings)].sort((a, b) =>
    featuredRank(a, now) - featuredRank(b, now) ||
    Number(b.isFeatured) - Number(a.isFeatured) ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
    a.id.localeCompare(b.id)
  )[0] ?? null;
  const upcoming = listings.find((listing) => matchesTab(listing, "UPCOMING", now)) ?? null;
  const counts = countInventoryTabs(listings, now);

  return {
    featured,
    comingNext: featured && matchesTab(featured, "UPCOMING", now) ? null : upcoming,
    counts,
    browse: (["LIVE", "UPCOMING", "ENDED"] as const).find((tab) => counts[tab] > 0) ?? null,
  };
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

function bidAmount(listing: PublicListing, now: number) {
  return describeForInventory(listing, now).price.amount;
}

/** Open Auctions by deadline first, then Closing ones, then everything else. */
function endingSoonKey(listing: PublicListing, now: number): [number, number] {
  const { timer } = describeForInventory(listing, now);
  if (timer === "countdown" && listing.auctionEndsAt) return [0, new Date(listing.auctionEndsAt).getTime()];
  return [timer === "closing" ? 1 : 2, 0];
}

export function filterAndSortAuctions(listings: PublicListing[], filters: InventoryFilters, now: number) {
  const query = filters.q.trim().toLowerCase();
  const visible = listings.filter((listing) => {
    if (!matchesTab(listing, filters.status, now)) return false;
    return !query || [listing.year, listing.make, listing.model, listing.location, listing.description]
      .join(" ").toLowerCase().includes(query);
  });

  return visible.sort((a, b) => {
    let order = 0;
    switch (filters.sort) {
      case "ending-soon": {
        const [groupA, deadlineA] = endingSoonKey(a, now);
        const [groupB, deadlineB] = endingSoonKey(b, now);
        order = groupA - groupB || deadlineA - deadlineB;
        break;
      }
      case "bid-low":
      case "bid-high":
        order = compareOptionalNumbers(
          bidAmount(a, now),
          bidAmount(b, now),
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
