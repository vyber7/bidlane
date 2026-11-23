import { FiPlus, FiSearch } from "react-icons/fi";
import { Bone, Line } from "@/app/components/Skeleton";
import { DashboardSkeleton, RowsSkeleton, StatsSkeleton, TabsSkeleton } from "../components/DashboardSkeleton";

// Mirrors ListingDrafts and ListingsDashboard.
export default function Loading() {
  return (
    <div>
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Saved Drafts</h2>
            <p className="mt-1 text-sm text-slate-500">Only you can see these drafts. Continue where you left off before submitting a vehicle.</p>
          </div>
          <div className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">Start a New Draft</div>
        </div>
        <Line className="mt-5"><Bone className="h-4 w-72 max-w-full bg-slate-100" /></Line>
      </section>
      <DashboardSkeleton
        eyebrow="Your garage"
        title="Listings"
        description="Manage your vehicles and keep an eye on auctions you love."
        action={
          <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-bold text-white">
            <FiPlus aria-hidden="true" className="text-base" /> Sell a Vehicle
          </div>
        }
      >
        <StatsSkeleton labels={["Submitted", "Live now", "Watching"]} />
        <TabsSkeleton labels={["My Vehicles", "Watchlist"]} />
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-1">
            {["All", "Live", "Upcoming", "Ended"].map((label, index) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${index === 0 ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="relative w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-500 sm:w-64">
            <FiSearch aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2" />
            e.g. Porsche 911…
          </div>
        </div>
        <RowsSkeleton thumb="sm:h-32 sm:w-52" />
      </DashboardSkeleton>
    </div>
  );
}
