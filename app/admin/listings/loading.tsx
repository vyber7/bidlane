import { Bone, Line } from "@/app/components/Skeleton";
import { reviewLabels } from "@/app/libs/listing-review";

// Mirrors app/admin/listings/page.tsx. The active filter comes from ?review=,
// which loading.tsx can't read, so no filter is highlighted.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6 lg:px-8" aria-label="Loading listing reviews" aria-busy="true">
      <span className="text-sm font-bold underline">← Administration</span>
      <h1 className="mt-5 text-3xl font-black">Listing reviews</h1>
      <p className="mt-3 text-sm text-slate-600">Review upcoming listings before buyers can see them or bidding can open. Oldest submissions appear first.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {Object.values(reviewLabels).map((label) => (
          <span key={label} className="rounded-full border bg-white px-4 py-2 text-sm font-bold text-slate-700">{label}</span>
        ))}
      </div>
      <ul className="mt-6 divide-y rounded-2xl border border-slate-200 bg-white">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <Line className="h-4"><Bone className="h-3 w-24 bg-amber-100" /></Line>
              <Line className="mt-1 h-6"><Bone className="h-4 w-48" /></Line>
              <Line className="mt-1"><Bone className="h-4 w-56 max-w-full bg-slate-100" /></Line>
            </div>
            <span className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Review listing →</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
