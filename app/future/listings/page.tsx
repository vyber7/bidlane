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
    <div className="m-auto pt-20 pb-4 max-w-5xl px-2">
      <AuctionSearchBrowser
        listings={futureListings}
        currentUser={currentUser}
        title="Future auctions"
        auctionType="future"
        eyebrow="Coming soon"
        description="Preview upcoming vehicles before bidding begins."
      />
    </div>
  );
};

export default FutureListings;
