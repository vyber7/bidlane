import BidsAndWinsDashboard from "@/app/account/components/BidsAndWinsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import prisma from "@/app/libs/prismadb";
import { buildBidSummaries } from "@/app/account/lib/bids";

const BidsAndWins = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const bids = await prisma.bid.findMany({
    where: { userId: currentUser.id },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <BidsAndWinsDashboard bids={buildBidSummaries(bids, currentUser.id)} />
  );
};

export default BidsAndWins;
