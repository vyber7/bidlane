import type { Listing } from "@prisma/client";
import type { ListingEvent } from "@/app/types/auction-events";

export function serializeListing(listing: Listing): ListingEvent {
  return {
    ...listing,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt?.toISOString() ?? null,
    lastCommentAt: listing.lastCommentAt?.toISOString() ?? null,
    auctionStartsAt: listing.auctionStartsAt?.toISOString() ?? null,
    auctionEndsAt: listing.auctionEndsAt?.toISOString() ?? null,
  };
}

export function deserializeListing(listing: ListingEvent): Listing {
  return {
    ...listing,
    createdAt: new Date(listing.createdAt),
    updatedAt: listing.updatedAt === null ? null : new Date(listing.updatedAt),
    lastCommentAt: listing.lastCommentAt === null ? null : new Date(listing.lastCommentAt),
    auctionStartsAt: listing.auctionStartsAt === null ? null : new Date(listing.auctionStartsAt),
    auctionEndsAt: listing.auctionEndsAt === null ? null : new Date(listing.auctionEndsAt),
  };
}
