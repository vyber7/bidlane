import { FiCheck } from "react-icons/fi";
import { Bone, Line } from "@/app/components/Skeleton";
import { DashboardSkeleton, StatsSkeleton, TabsSkeleton } from "../components/DashboardSkeleton";

const emailSettings = [
  {
    title: "Email Notifications",
    description: "Get an email when another bidder takes the lead, even when you’re away from BidLane.",
    label: "Email me when I’m outbid",
  },
  {
    title: "Ending-Soon Reminders",
    description: "Get a reminder in the final hour of auctions you watch or bid on.",
    label: "Email me when auctions are ending soon",
  },
];

// Mirrors the two EmailNotificationSettings cards and NotificationsCenter.
export default function Loading() {
  return (
    <div>
      {emailSettings.map(({ title, description, label }) => (
        <section key={title} className="mb-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3 text-sm font-semibold text-slate-800">
              <Bone className="mt-0.5 h-4 w-4 shrink-0" />
              {label}
            </div>
            <Line className="h-10"><Bone className="h-4 w-full max-w-md bg-slate-100" /></Line>
            <div className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white opacity-50">
              Save Email Preferences
            </div>
          </div>
        </section>
      ))}
      <DashboardSkeleton
        raised
        eyebrow="Account activity"
        title="Notifications"
        description="Auction results, bid updates, and buyer questions in one place."
        action={
          <span className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-gray-400">
            <FiCheck aria-hidden="true" /> Mark All as Read
          </span>
        }
      >
        <StatsSkeleton labels={["Total", "Unread"]} />
        <TabsSkeleton labels={["All", "Unread"]} compact />
        <ul className="divide-y divide-gray-200">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="p-4 sm:p-5">
              <div className="flex gap-3 sm:gap-4">
                <Bone className="h-10 w-10 shrink-0 rounded-full bg-gray-100" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Line className="h-6"><Bone className="h-4 w-48 max-w-full" /></Line>
                      <Line className="mt-1 h-6"><Bone className="h-4 w-full max-w-md bg-gray-100" /></Line>
                    </div>
                    <Bone className="h-3 w-24 bg-gray-100" />
                  </div>
                  <Line className="mt-3"><Bone className="h-4 w-24" /></Line>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </DashboardSkeleton>
    </div>
  );
}
