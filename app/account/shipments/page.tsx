import ShipmentsDashboard from "@/app/account/components/ShipmentsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import prisma from "@/app/libs/prismadb";
import { buildShipments } from "@/app/account/lib/shipments";

const Shipments = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const soldListings = await prisma.listing.findMany({
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
  });

  return (
    <ShipmentsDashboard shipments={buildShipments(soldListings, currentUser.id)} />
  );
};

export default Shipments;
