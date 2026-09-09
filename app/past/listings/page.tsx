import prisma from "../../libs/prismadb";
import Listings from "@/app/components/Listings";
import getCurrentUser from "@/app/actions/getCurrentUser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Results",
  description: "Browse past vehicle auctions on BidLane.",
};

export const dynamic = "force-dynamic";

const PastListings = async () => {
  const pastListings = await prisma.listing.findMany({
    where: { status: "ENDED" },
  });
  const count = await prisma.listing.count({
    where: { status: "ENDED" },
  });

  const currentUser = await getCurrentUser(); // Past listings page is public, so no current user
  return (
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">Past Auctions</h2>
      <span className="text-sm font-normal"> ({count})</span>
      {pastListings ? (
        <Listings listings={pastListings} currentUser={currentUser} />
      ) : (
        <p>No cars found.</p>
      )}
    </div>
  );
};

export default PastListings;
