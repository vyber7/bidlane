import type { Bid, Listing } from "@/app/types/database";
import type { AuctionBid } from "@/app/types/account";
import { transactionHref } from "@/app/libs/transaction-completion";
import { listingGroup, transactionAccess, type AuctionGroup } from "@/app/libs/listing-capabilities";
import { toPublicListing, type PublicListing } from "@/app/libs/listing-codec";

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
      const auction = toPublicListing(listing, userId);
      return {
        id: listing.id,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        location: listing.location,
        coverImage: listing.coverImage,
        highestBid,
        lastBidAt: lastBidAt.toISOString(),
        bidCount,
        auction,
        ...auctionStanding(auction, listingGroup(listing, now), userId),
      };
    }
  );
}

/**
 * Where the bidder stands in an Auction: the fields of a bid summary that
 * change as the Auction does. The dashboard recomputes them from the live
 * Auction, so a summary built here is only its starting value.
 */
export function auctionStanding(auction: PublicListing, group: AuctionGroup, userId: string) {
  return {
    status: auction.status,
    result: auction.result,
    group,
    currentBid: auction.currentBid,
    auctionEndsAt: auction.auctionEndsAt?.toISOString() ?? null,
    isHighestBidder: auction.highestBidderId === userId,
    completionHref: transactionAccess(auction, userId)?.role === "buyer" ? transactionHref(auction.id) : null,
  } satisfies Partial<AuctionBid>;
}
