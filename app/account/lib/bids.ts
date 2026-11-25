import type { Bid, Listing } from "@/app/types/database";
import type { AuctionBid } from "@/app/types/account";
import { transactionHref } from "@/app/libs/transaction-completion";
import { listingCapabilities } from "@/app/libs/listing-capabilities";

export type BidWithListing = Bid & { listing: Listing };

// The account query returns bids newest first, which also determines row order.
export function buildBidSummaries(
  bids: readonly BidWithListing[],
  userId: string,
  now = Date.now(),
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
    ({ listing, highestBid, lastBidAt, bidCount }) => {
      const { completeTransaction: transaction, group } = listingCapabilities(listing, { id: userId }, now);
      return {
        id: listing.id,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        location: listing.location,
        coverImage: listing.coverImage,
        status: listing.status,
        result: listing.result,
        group,
        currentBid: listing.currentBid,
        auctionEndsAt: listing.auctionEndsAt?.toISOString() ?? null,
        highestBid,
        lastBidAt: lastBidAt.toISOString(),
        bidCount,
        isHighestBidder: listing.highestBidderId === userId,
        completionHref: transaction?.role === "buyer" ? transactionHref(listing.id) : null,
      };
    }
  );
}
