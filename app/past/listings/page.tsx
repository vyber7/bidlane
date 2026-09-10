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
    <div className="m-auto pt-20 pb-4 max-w-5xl px-2">
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
