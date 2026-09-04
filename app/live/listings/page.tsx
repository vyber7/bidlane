import prisma from "../../libs/prismadb";
import Listings from "@/app/components/Listings";
import getCurrentUser from "@/app/actions/getCurrentUser";

export const dynamic = "force-dynamic";

const LiveListings = async () => {
  const liveListings = await prisma.listing.findMany({
    where: {
      status: "LIVE",
    },
  });

  const count = await prisma.listing.count({
    where: {
      status: "LIVE",
    },
  });

  const currentUser = await getCurrentUser();

  return (
    <div className="m-auto pt-16 pb-4 max-w-5xl px-2">
      <h2 className="text-md font-bold w-max inline-block">
        Live Auctions
        <span className="text-sm font-normal"> ({count})</span>{" "}
      </h2>
      {liveListings ? (
        <Listings listings={liveListings} currentUser={currentUser} />
      ) : (
        <p>No cars found.</p>
      )}
    </div>
  );
};

export default LiveListings;
