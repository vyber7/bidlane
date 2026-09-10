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
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">
        Live Auctions
        <span className="text-sm font-normal"> ({liveListings.length})</span>{" "}
      </h2>
      <AuctionSearchBrowser
        listings={liveListings}
        currentUser={currentUser}
        auctionType="live"
      />
    </div>
  );
};

export default LiveListings;
