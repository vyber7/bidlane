import prisma from "../../libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import AuctionSearchBrowser from "@/app/components/AuctionSearchBrowser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Results",
  description: "Browse past vehicle auctions on BidLane.",
};

export const dynamic = "force-dynamic";

const PastListings = async () => {
  const [pastListings, currentUser] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "ENDED" },
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 pt-20 sm:px-6 lg:px-8">
      <AuctionSearchBrowser
        listings={pastListings}
        currentUserId={currentUser?.id}
        title="Past auctions"
        auctionType="past"
        eyebrow="Auction results"
        description="Review completed auctions and recent sale results."
      />
    </div>
  );
};

export default PastListings;
