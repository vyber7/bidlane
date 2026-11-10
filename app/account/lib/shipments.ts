import type { Listing } from "@/app/types/database";
import type { ShipmentTransaction } from "@/app/types/account";

export type SoldListing = Pick<Listing, "id" | "userId" | "year" | "make" | "model" | "location" | "coverImage" | "currentBid" | "startingBid" | "auctionEndsAt" | "updatedAt" | "createdAt"> & {
  user: { name: string | null; email: string | null };
  highestBidder: { name: string | null; email: string | null } | null;
};

export function buildShipments(
  soldListings: readonly SoldListing[],
  userId: string
): ShipmentTransaction[] {
  return soldListings.map((listing) => {
    const role = listing.userId === userId ? "seller" : "buyer";
    const contact = role === "seller" ? listing.highestBidder : listing.user;

    return {
      id: listing.id,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      location: listing.location,
      coverImage: listing.coverImage,
      price: listing.currentBid ?? listing.startingBid ?? 0,
      soldAt: (listing.auctionEndsAt ?? listing.updatedAt ?? listing.createdAt).toISOString(),
      role,
      contactName: contact?.name?.split(" ")[0] ?? (role === "seller" ? "the buyer" : "the seller"),
      contactEmail: contact?.email ?? null,
    };
  });
}
