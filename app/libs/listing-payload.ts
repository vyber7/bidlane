import type { Listing } from "@prisma/client";
import { readVehicleRecords } from "@/app/schemas/vehicle-trust";

// Runtime allowlist: adding a database field must never publish it implicitly.
export const publicListingFields = [
  "id", "userId", "year", "make", "model", "miles", "images", "location", "description",
  "transmission", "drivetrain", "titleStatus", "serviceHistory", "modifications", "knownFlaws",
  "vin", "vehicleRecords", "createdAt", "updatedAt", "lastCommentAt", "views", "coverImage",
  "auctionStartsAt", "auctionEndsAt", "status", "result", "isFeatured", "startingBid", "currentBid",
  "bidIncrement", "highestBidderId",
] as const satisfies readonly (keyof Listing)[];

type PublicFields = Pick<Listing, (typeof publicListingFields)[number]>;
export type PublicListing = PublicFields & {
  isNoReserve: boolean;
  watcherCount: number;
  isWatching: boolean;
};
export type SellerListing = PublicListing & Pick<Listing,
  "reservePrice" | "reviewStatus" | "reviewRevision" | "reviewNote"
>;

function pickPublicFields(listing: PublicFields): PublicFields {
  return Object.fromEntries(publicListingFields.map((field) => [field, listing[field]])) as PublicFields;
}

export function toPublicListing(listing: Listing, viewerId?: string | null): PublicListing {
  return {
    ...pickPublicFields(listing),
    vehicleRecords: readVehicleRecords(listing.vehicleRecords),
    isNoReserve: listing.reservePrice === null,
    watcherCount: listing.watchersIds.length,
    isWatching: Boolean(viewerId && listing.watchersIds.includes(viewerId)),
  };
}

// Reapply the allowlist at event boundaries, even if a caller passes an object
// with extra fields despite its static PublicListing type.
export function publicListingSnapshot(listing: PublicListing): PublicListing {
  return {
    ...pickPublicFields(listing),
    vehicleRecords: readVehicleRecords(listing.vehicleRecords),
    isNoReserve: listing.isNoReserve,
    watcherCount: listing.watcherCount,
    isWatching: listing.isWatching,
  };
}

export function toSellerListing(listing: Listing, viewer: { id: string; role?: string | null } | null): SellerListing {
  if (!viewer || (viewer.id !== listing.userId && viewer.role !== "ADMIN")) {
    throw new Error("Only the seller or an admin can access listing management data.");
  }
  return {
    ...toPublicListing(listing, viewer.id),
    reservePrice: listing.reservePrice,
    reviewStatus: listing.reviewStatus,
    reviewRevision: listing.reviewRevision,
    reviewNote: listing.reviewNote,
  };
}
