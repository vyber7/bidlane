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
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">Past Auctions</h2>
      <span className="text-sm font-normal"> ({pastListings.length})</span>
      <AuctionSearchBrowser
        listings={pastListings}
        currentUser={currentUser}
        auctionType="past"
      />
    </div>
  );
};

export default PastListings;
