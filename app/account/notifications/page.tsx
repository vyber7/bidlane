import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountHeader from "@/app/account/components/AccountHeader";
import AccountLinks from "@/app/account/components/AccountLinks";
import NotificationsCenter, {
  type AccountNotification,
} from "@/app/account/components/NotificationsCenter";
import prisma from "@/app/libs/prismadb";

export const dynamic = "force-dynamic";

const Notifications = async () => {
  const currentUser = await getCurrentUser();

  const [bids, watchedListings, sellerListings] = currentUser
    ? await Promise.all([
        prisma.bid.findMany({
          where: { userId: currentUser.id },
          include: { listing: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.listing.findMany({
          where: { watchersIds: { has: currentUser.id } },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.listing.findMany({
          where: { userId: currentUser.id },
          include: {
            comments: {
              where: { userId: { not: currentUser.id } },
              include: { user: { select: { name: true } } },
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
      ])
    : [[], [], []];

  const notifications: AccountNotification[] = [];
  const latestBidByListing = new Map<string, (typeof bids)[number]>();

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
      const leading = listing.highestBidderId === currentUser?.id;
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
      const won = listing.result === "SOLD" && listing.highestBidderId === currentUser?.id;
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

  return (
    <div className="m-auto grid max-w-5xl grid-cols-4 gap-4 px-2 pb-8 lg:px-0">
      <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
      <AccountLinks />
      <div className="col-span-4 lg:col-span-3">
        <NotificationsCenter
          notifications={notifications}
          userId={currentUser?.id ?? "guest"}
        />
      </div>
    </div>
  );
};

export default Notifications;
