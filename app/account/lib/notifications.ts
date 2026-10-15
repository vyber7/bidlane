import type { Listing, Prisma } from "@prisma/client";
import type { AccountNotification } from "@/app/types/account";
import type { BidWithListing } from "./bids";

type SellerListing = Prisma.ListingGetPayload<{
  include: { comments: { include: { user: { select: { name: true } } } } };
}>;

// Bids are newest first; seller comments have already been scoped by the query.
export function buildAccountNotifications({
  bids,
  watchedListings,
  sellerListings,
  userId,
}: {
  bids: readonly BidWithListing[];
  watchedListings: readonly Listing[];
  sellerListings: readonly SellerListing[];
  userId: string;
}): AccountNotification[] {
  const notifications: AccountNotification[] = [];
  const latestBidByListing = new Map<string, BidWithListing>();

  for (const bid of bids) {
    if (!latestBidByListing.has(bid.listingId)) {
      latestBidByListing.set(bid.listingId, bid);
    }
  }

  for (const bid of latestBidByListing.values()) {
    const { listing } = bid;
    const vehicle = `${listing.year} ${listing.make} ${listing.model}`;
    const href = `/listing/${listing.id}`;

    if (listing.status === "LIVE") {
      const leading = listing.highestBidderId === userId;
      notifications.push({
        id: `bid-${listing.id}-${leading ? "leading" : "outbid"}-${listing.currentBid ?? 0}`,
        kind: "bid",
        title: leading ? "You’re the highest bidder" : "You’ve been outbid",
        message: leading
          ? `Your bid is leading on the ${vehicle}. Keep an eye on the auction until it closes.`
          : `Another bidder has taken the lead on the ${vehicle}. There’s still time to bid again.`,
        createdAt: (listing.updatedAt ?? bid.createdAt).toISOString(),
        href,
        actionLabel: leading ? "View auction" : "Bid again",
        tone: leading ? "success" : "warning",
      });
    } else if (listing.status === "ENDED") {
      const won = listing.result === "SOLD" && listing.highestBidderId === userId;
      notifications.push({
        id: `bid-${listing.id}-ended-${won ? "won" : "closed"}`,
        kind: "auction",
        title: won ? "You won the auction" : "Auction ended",
        message: won
          ? `Congratulations — your bid won the ${vehicle}.`
          : `The auction for the ${vehicle} has ended.`,
        createdAt: (listing.auctionEndsAt ?? listing.updatedAt ?? bid.createdAt).toISOString(),
        href,
        actionLabel: won ? "View your win" : "View result",
        tone: won ? "success" : "neutral",
      });
    }
  }

  const bidListingIds = new Set(latestBidByListing.keys());
  for (const listing of watchedListings) {
    if (bidListingIds.has(listing.id) || listing.status !== "LIVE") continue;
    notifications.push({
      id: `watch-${listing.id}-live`,
      kind: "auction",
      title: "A watched auction is live",
      message: `Bidding is open on the ${listing.year} ${listing.make} ${listing.model}.`,
      createdAt: (listing.auctionStartsAt ?? listing.updatedAt ?? listing.createdAt).toISOString(),
      href: `/listing/${listing.id}`,
      actionLabel: "View auction",
      tone: "neutral",
    });
  }

  for (const listing of sellerListings) {
    const vehicle = `${listing.year} ${listing.make} ${listing.model}`;
    for (const comment of listing.comments) {
      notifications.push({
        id: `comment-${comment.id}`,
        kind: "comment",
        title: "New comment on your listing",
        message: `${comment.user?.name ?? "A buyer"} commented on your ${vehicle}${
          comment.body ? `: “${comment.body.slice(0, 100)}${comment.body.length > 100 ? "…" : ""}”` : "."
        }`,
        createdAt: comment.createdAt.toISOString(),
        href: `/listing/${listing.id}#comments`,
        actionLabel: "View comment",
        tone: "neutral",
      });
    }

    if (listing.status === "ENDED") {
      notifications.push({
        id: `seller-${listing.id}-ended-${listing.result ?? "ended"}`,
        kind: "auction",
        title: listing.result === "SOLD" ? "Your vehicle sold" : "Your auction ended",
        message:
          listing.result === "SOLD"
            ? `The ${vehicle} has sold. Review the final auction details.`
            : `The auction for your ${vehicle} has closed.`,
        createdAt: (listing.auctionEndsAt ?? listing.updatedAt ?? listing.createdAt).toISOString(),
        href: `/listing/${listing.id}`,
        actionLabel: "View result",
        tone: listing.result === "SOLD" ? "success" : "neutral",
      });
    }
  }

  notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return notifications;
}
