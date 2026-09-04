import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountHeader from "@/app/account/components/AccountHeader";
import AccountLinks from "@/app/account/components/AccountLinks";
import BidsAndWinsDashboard from "@/app/account/components/BidsAndWinsDashboard";
import prisma from "@/app/libs/prismadb";

export const dynamic = "force-dynamic";

const BidsAndWins = async () => {
  const currentUser = await getCurrentUser();

  const bids = currentUser
    ? await prisma.bid.findMany({
        where: { userId: currentUser.id },
        include: { listing: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Keep one row per vehicle while preserving the user's highest bid and the
  // date of their most recent activity on that auction.
  const bidsByListing = new Map<
    string,
    {
      listing: (typeof bids)[number]["listing"];
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

  const auctionBids = Array.from(bidsByListing.values()).map(
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
      isHighestBidder: listing.highestBidderId === currentUser?.id,
    })
  );

  return (
    <div className="m-auto grid max-w-5xl grid-cols-4 gap-4 px-2 pb-8 lg:px-0">
      <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
      <AccountLinks />
      <div className="col-span-4 lg:col-span-3">
        <BidsAndWinsDashboard bids={auctionBids} />
      </div>
    </div>
  );
};

export default BidsAndWins;
