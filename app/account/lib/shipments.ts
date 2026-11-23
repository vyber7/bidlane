import type { Listing } from "@/app/types/database";
import type { ShipmentTransaction } from "@/app/types/account";
import { transactionAccess, transactionCompletion, type CompletionFields } from "@/app/libs/transaction-completion";

export type SoldListing = Pick<Listing, "id" | "status" | "result" | "userId" | "highestBidderId" | "year" | "make" | "model" | "location" | "coverImage" | "currentBid" | "startingBid" | "auctionEndsAt" | "updatedAt" | "createdAt"> & CompletionFields & {
  user: { name: string | null; email: string | null };
  highestBidder: { name: string | null; email: string | null } | null;
};

export function buildShipments(
  soldListings: readonly SoldListing[],
  userId: string
): ShipmentTransaction[] {
  return soldListings.flatMap((listing) => {
    const access = transactionAccess(listing, userId);
    if (!access) return [];
    const { role, canComplete } = access;
    const contact = role === "buyer" ? listing.user : canComplete ? listing.highestBidder : null;

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
      completion: canComplete ? transactionCompletion(listing) : null,
    };
  });
}
