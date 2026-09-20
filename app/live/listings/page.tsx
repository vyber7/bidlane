import prisma from "../../libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import AuctionSearchBrowser from "@/app/components/AuctionSearchBrowser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Live Listings",
  description: "Browse live vehicle auctions on BidLane.",
};

export const dynamic = "force-dynamic";

const LiveListings = async () => {
  const [liveListings, currentUser] = await Promise.all([
    prisma.listing.findMany({
      where: {
        status: "LIVE",
      },
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 pt-20 sm:px-6 lg:px-8">
      <AuctionSearchBrowser
        listings={liveListings}
        currentUserId={currentUser?.id}
        title="Live auctions"
        auctionType="live"
        eyebrow="The lineup"
        description="Fresh listings, live bids, and recently completed sales."
      />
    </div>
  );
};

export default LiveListings;
