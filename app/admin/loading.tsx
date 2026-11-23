import { Bone, Line } from "@/app/components/Skeleton";

// Mirrors app/admin/page.tsx.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6 lg:px-8" aria-label="Loading administration" aria-busy="true">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">BidLane admin</p>
      <h1 className="mt-2 text-3xl font-black text-slate-950">Administration</h1>
      <Line className="mt-3"><Bone className="h-4 w-64 max-w-full bg-slate-100" /></Line>
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {["Accounts", "Listings", "Live auctions"].map((label) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <dt className="text-sm font-semibold text-slate-500">{label}</dt>
            <Line className="mt-2 h-9"><Bone className="h-7 w-16" /></Line>
          </div>
        ))}
      </dl>
      <div className="mt-8 flex gap-5 text-sm font-bold">
        <span className="underline">Review listings</span>
        <span className="underline">My account</span>
        <span className="underline">Browse auctions</span>
      </div>
    </div>
  );
}
