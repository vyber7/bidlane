import type { PublicListing } from "@/app/libs/listing-payload";
import { acceptedBid, auctionPhase } from "@/app/libs/auction-lifecycle";

export function getHomeSpotlight(listings: PublicListing[], now = Date.now()) {
  return {
    featured: selectFeaturedAuction(listings, now),
    live: listings.some((listing) => acceptedBid(auctionPhase(listing, now)) !== null),
    upcoming: listings.find((listing) => listing.status === "UPCOMING") ?? null,
  };
}

export function selectFeaturedAuction(listings: PublicListing[], now = Date.now()): PublicListing | null {
  const priority = (listing: PublicListing) => {
    if (acceptedBid(auctionPhase(listing, now)) !== null) return 0;
    if (listing.status === "UPCOMING") return 1;
    if (listing.status === "ENDED") return 2;
    return 3;
  };

  const eligible = listings.filter((listing) => priority(listing) < 3);
  // Keep real photography in the main feature; the page can promote an
  // upcoming car without photos separately in its coming-next row.
  const photographed = eligible.filter((listing) => listing.coverImage || listing.images[0]);

  return (photographed.length ? photographed : eligible).sort((a, b) =>
    priority(a) - priority(b) ||
    Number(b.isFeatured) - Number(a.isFeatured) ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
    a.id.localeCompare(b.id)
  )[0] ?? null;
}
