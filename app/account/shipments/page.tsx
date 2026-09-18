import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountHeader from "@/app/account/components/AccountHeader";
import AccountLinks from "@/app/account/components/AccountLinks";
import ShipmentsDashboard, {
  ShipmentTransaction,
} from "@/app/account/components/ShipmentsDashboard";
import prisma from "@/app/libs/prismadb";

export const dynamic = "force-dynamic";

const Shipments = async () => {
  const currentUser = await getCurrentUser();

  const soldListings = currentUser
    ? await prisma.listing.findMany({
        where: {
          status: "ENDED",
          result: "SOLD",
          OR: [
            { userId: currentUser.id },
            { highestBidderId: currentUser.id },
          ],
        },
        include: {
          user: { select: { name: true, email: true } },
          highestBidder: { select: { name: true, email: true } },
        },
        orderBy: { auctionEndsAt: "desc" },
      })
    : [];

  const shipments: ShipmentTransaction[] = soldListings.map((listing) => {
    const role = listing.userId === currentUser?.id ? "seller" : "buyer";
    const contact = role === "seller" ? listing.highestBidder : listing.user;

    return {
      id: listing.id,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      location: listing.location,
      coverImage: listing.coverImage,
      price: listing.currentBid ?? listing.startingBid ?? 0,
      soldAt: (listing.auctionEndsAt ?? listing.updatedAt ?? listing.createdAt).toISOString(),
      role,
      contactName: contact?.name?.split(" ")[0] ?? (role === "seller" ? "the buyer" : "the seller"),
      contactEmail: contact?.email ?? null,
    };
  });

  return (
    <div className="m-auto grid max-w-5xl grid-cols-4 gap-4 px-2 pb-8 lg:px-0">
      <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
      <AccountLinks />
      <div className="col-span-4 lg:col-span-3">
        <ShipmentsDashboard shipments={shipments} />
      </div>
    </div>
  );
};

export default Shipments;
