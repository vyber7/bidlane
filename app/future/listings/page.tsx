import prisma from "../../libs/prismadb";
import Listings from "@/app/components/Listings";
import getCurrentUser from "@/app/actions/getCurrentUser";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Future Listings",
  description: "Browse upcoming vehicle auctions on BidLane.",
};

export const dynamic = "force-dynamic";

const FutureListings = async () => {
  const futureListings = await prisma.listing.findMany({
    where: { status: "UPCOMING" },
  });
  const count = await prisma.listing.count({
    where: { status: "UPCOMING" },
  });

  const currentUser = await getCurrentUser(); // Future listings page is public, so no current user
  return (
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">Future Auctions</h2>
      <span className="text-sm font-normal"> ({count})</span>
      {futureListings ? (
        <Listings listings={futureListings} currentUser={currentUser} />
      ) : (
        <p>No cars found.</p>
      )}
    </div>
  );
};

export default FutureListings;
