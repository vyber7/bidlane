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
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">Future Auctions</h2>
      <span className="text-sm font-normal"> ({futureListings.length})</span>
      <AuctionSearchBrowser
        listings={futureListings}
        currentUser={currentUser}
        auctionType="future"
      />
    </div>
  );
};

export default FutureListings;
