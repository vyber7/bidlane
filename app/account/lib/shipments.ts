import type { Prisma } from "@prisma/client";
import type { ShipmentTransaction } from "@/app/types/account";

type SoldListing = Prisma.ListingGetPayload<{
  include: {
    user: { select: { name: true; email: true } };
    highestBidder: { select: { name: true; email: true } };
  };
}>;

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
