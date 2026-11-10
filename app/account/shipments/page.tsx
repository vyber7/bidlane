import ShipmentsDashboard from "@/app/account/components/ShipmentsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getReadRepositories } from "@/app/libs/read-repositories";
import { buildShipments } from "@/app/account/lib/shipments";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BidLane | Purchases & sales",
  description: "View auction results and contact the buyer or seller to arrange payment, paperwork, and vehicle handoff.",
};

const Shipments = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const soldListings = await getReadRepositories().shipments.forUser(currentUser.id);

  return (
    <ShipmentsDashboard shipments={buildShipments(soldListings, currentUser.id)} />
  );
};

export default Shipments;
