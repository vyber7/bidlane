import BidsAndWinsDashboard from "@/app/account/components/BidsAndWinsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getReadRepositories } from "@/app/libs/read-repositories";
import { buildBidSummaries } from "@/app/account/lib/bids";

const BidsAndWins = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const bids = await getReadRepositories().bids.forUser(currentUser.id);

  return (
    <BidsAndWinsDashboard bids={buildBidSummaries(bids, currentUser.id)} />
  );
};

export default BidsAndWins;
