import { FiArrowUpRight } from "react-icons/fi";
import { DashboardSkeleton, RowsSkeleton, StatsSkeleton, TabsSkeleton } from "../components/DashboardSkeleton";

// Mirrors ShipmentsDashboard. The "Your Next Steps" panel only shows when there
// are transactions, so it's left out here.
export default function Loading() {
  return (
    <DashboardSkeleton
      eyebrow="Vehicle handoff"
      title="Purchases & Sales"
      description="Work with your buyer or seller to complete payment, paperwork, and pickup."
      action={
        <span className="inline-flex w-fit items-center gap-1 text-sm font-bold text-gray-900">
          After-Auction Guide <FiArrowUpRight aria-hidden="true" />
        </span>
      }
    >
      <StatsSkeleton labels={["Total", "Purchases", "Sales"]} />
      <TabsSkeleton labels={["All", "Purchases", "Sales"]} />
      <RowsSkeleton count={2} />
    </DashboardSkeleton>
  );
}
