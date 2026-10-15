import type { Prisma } from "@prisma/client";
import type { AuctionBid } from "@/app/types/account";

export type BidWithListing = Prisma.BidGetPayload<{ include: { listing: true } }>;

// The account query returns bids newest first, which also determines row order.
export function buildBidSummaries(
  bids: readonly BidWithListing[],
  userId: string
): AuctionBid[] {
  // Keep one row per vehicle while preserving the user's highest bid and the
  // date of their most recent activity on that auction.
  const bidsByListing = new Map<
    string,
    {
      listing: BidWithListing["listing"];
      highestBid: number;
      lastBidAt: Date;
      bidCount: number;
    }
  >();

  for (const bid of bids) {
    const existing = bidsByListing.get(bid.listingId);

    if (existing) {
      existing.highestBid = Math.max(existing.highestBid, bid.amount);
      existing.bidCount += 1;
      continue;
    }

    bidsByListing.set(bid.listingId, {
      listing: bid.listing,
      highestBid: bid.amount,
      lastBidAt: bid.createdAt,
      bidCount: 1,
    });
  }

  return Array.from(bidsByListing.values()).map(
    ({ listing, highestBid, lastBidAt, bidCount }) => ({
      id: listing.id,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      location: listing.location,
      coverImage: listing.coverImage,
      status: listing.status,
      result: listing.result,
      currentBid: listing.currentBid,
      auctionEndsAt: listing.auctionEndsAt?.toISOString() ?? null,
      highestBid,
      lastBidAt: lastBidAt.toISOString(),
      bidCount,
      isHighestBidder: listing.highestBidderId === userId,
    })
  );
}
