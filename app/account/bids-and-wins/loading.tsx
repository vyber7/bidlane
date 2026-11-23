import { FiArrowUpRight } from "react-icons/fi";
import { DashboardSkeleton, RowsSkeleton, StatsSkeleton, TabsSkeleton } from "../components/DashboardSkeleton";

// Mirrors BidsAndWinsDashboard.
export default function Loading() {
  return (
    <DashboardSkeleton
      raised
      eyebrow="Auction activity"
      title="Bids & Wins"
      description="Follow every vehicle you bid on, from first bid to final result."
      action={
        <span className="inline-flex w-fit items-center gap-1 text-sm font-bold text-gray-900">
          Browse Auctions <FiArrowUpRight aria-hidden="true" />
        </span>
      }
    >
      <StatsSkeleton labels={["Active", "Leading", "Won value"]} />
      <TabsSkeleton labels={["Active Bids", "Wins", "Past Bids"]} />
      <RowsSkeleton thumb="sm:h-28 sm:w-44" />
    </DashboardSkeleton>
  );
}
