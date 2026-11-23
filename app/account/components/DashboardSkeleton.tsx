import type { ReactNode } from "react";
import { Bone, Line } from "@/app/components/Skeleton";

// Pieces shared by the account tab loading.tsx files. They mirror the
// header, stat row, tabs, and rows of the account dashboards.

export function DashboardSkeleton({
  eyebrow,
  title,
  description,
  action,
  raised = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  // Bids & Wins and Notifications use a raised card instead of a bordered one.
  raised?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={`Loading ${title}`}
      aria-busy="true"
      className={`overflow-hidden bg-white ${raised ? "rounded-md shadow-md shadow-gray-400" : "rounded-xl border border-gray-200 shadow-sm"}`}
    >
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">{eyebrow}</p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-950">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function StatsSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className={`grid border-b border-gray-200 bg-gray-50 ${labels.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {labels.map((label) => (
        <div key={label} className="border-r border-gray-200 px-3 py-4 last:border-r-0 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <Line className="mt-1 h-8">
            <Bone className="h-6 w-12" />
          </Line>
        </div>
      ))}
    </div>
  );
}

export function TabsSkeleton({ labels, compact = false }: { labels: string[]; compact?: boolean }) {
  return (
    <div className={`border-b border-gray-200 px-4 sm:px-6 ${compact ? "pt-3" : ""}`}>
      <div className="flex flex-wrap gap-x-5">
        {labels.map((label, index) => (
          <div
            key={label}
            className={`flex items-center whitespace-nowrap border-b-2 px-1 ${compact ? "py-3" : "py-4"} text-sm font-bold ${
              index === 0 ? "border-gray-950 text-gray-950" : "border-transparent text-gray-500"
            }`}
          >
            {label}
            <Bone className={`ml-2 h-5 w-7 rounded-full ${index === 0 ? "bg-gray-300" : "bg-gray-100"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Thumbnail-and-details row used by Listings, Bids & Wins, and Purchases & Sales.
export function RowsSkeleton({ count = 3, thumb = "sm:h-32 sm:w-48" }: { count?: number; thumb?: string }) {
  return (
    <ul className="divide-y divide-gray-200">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Bone className={`h-44 w-full shrink-0 rounded-lg bg-gray-100 ${thumb}`} />
            <div className="min-w-0 flex-1">
              <Line className="h-6"><Bone className="h-5 w-56 max-w-full" /></Line>
              <Line className="mt-1"><Bone className="h-4 w-32 bg-gray-100" /></Line>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, detail) => (
                  <div key={detail} className={detail === 2 ? "col-span-2 sm:col-span-1" : ""}>
                    <Line className="h-4"><Bone className="h-3 w-16 bg-gray-100" /></Line>
                    <Line className="mt-0.5"><Bone className="h-4 w-20" /></Line>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <Bone className="h-3 w-24 bg-gray-100" />
                <Bone className="h-4 w-24" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
