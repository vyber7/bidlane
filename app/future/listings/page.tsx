import prisma from "../../libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import AuctionSearchBrowser from "@/app/components/AuctionSearchBrowser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Future Listings",
  description: "Browse upcoming vehicle auctions on BidLane.",
};

export const dynamic = "force-dynamic";

const FutureListings = async () => {
  const [futureListings, currentUser] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "UPCOMING" },
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 pt-20 sm:px-6 lg:px-8">
      <AuctionSearchBrowser
        listings={futureListings}
        currentUserId={currentUser?.id}
        title="Future auctions"
        auctionType="future"
        eyebrow="Coming soon"
        description="Preview upcoming vehicles before bidding begins."
      />
    </div>
  );
};

export default FutureListings;
