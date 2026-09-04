import prisma from "../libs/prismadb";
import getCurrentUser from "../actions/getCurrentUser";
import Listings from "../components/Listings";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await prisma.listing.findMany();
  const count = await prisma.listing.count();
  const countFuture = await prisma.listing.count({
    where: { status: "UPCOMING" },
  });
  const countPast = await prisma.listing.count({
    where: { status: "ENDED" },
  });
  const countLive = await prisma.listing.count({
    where: { status: "LIVE" },
  });

  const currentUser = await getCurrentUser();

  return (
    <div className="m-auto pt-14 lg:pt-16 pb-4 max-w-5xl px-2">
      <div className="flex justify-between">
        <h2 className="text-md font-bold w-max inline-block">
          All Auctions
          <span className="text-sm font-normal"> ({count})</span>{" "}
        </h2>
        <h2 className="text-md font-bold w-max md:inline-block hidden">
          <Link href="/live/listings">Live Auctions</Link>
          <span className="text-sm font-normal"> ({countLive})</span>{" "}
        </h2>
        <h2 className="text-md font-bold w-max md:inline-block hidden">
          <Link href="/future/listings">Upcoming Auctions</Link>
          <span className="text-sm font-normal"> ({countFuture})</span>{" "}
        </h2>
        <h2 className="text-md font-bold w-max md:inline-block hidden">
          <Link href="/past/listings">Past Auctions</Link>
          <span className="text-sm font-normal"> ({countPast})</span>{" "}
        </h2>
      </div>

      {listings ? (
        <Listings listings={listings} currentUser={currentUser} />
      ) : (
        <p>No cars found.</p>
      )}
    </div>
  );
}
