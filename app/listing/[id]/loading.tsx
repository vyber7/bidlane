import { LoadingStatus } from "@/app/components/Skeleton";
import Link from "next/link";
import { FiArrowLeft, FiMapPin } from "react-icons/fi";
import { vehicleDisclosureFields, vehicleSpecificationFields } from "@/app/libs/vehicle-details";

// Mirrors app/listing/[id]/page.tsx so the listing doesn't shift when it streams in.
// Static copy renders as-is; only listing data is a placeholder.

const glanceLabels = [
  "Year",
  "Make",
  "Model",
  "Mileage",
  "Location",
  "VIN / chassis",
  ...vehicleSpecificationFields.map(({ label }) => label),
];

const bar = "motion-safe:animate-pulse rounded";

export default function Loading() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <LoadingStatus label="Loading auction" />
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-950"
      >
        <FiArrowLeft aria-hidden="true" /> All auctions
      </Link>
      <header className="mb-6">
        <div className="flex h-9 items-center sm:h-12">
          <div className={`${bar} h-8 w-3/4 max-w-xl bg-slate-200 sm:h-10`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <FiMapPin aria-hidden="true" />
            <span className={`${bar} h-4 w-24 bg-slate-200`} />
          </span>
          <span className={`${bar} h-4 w-20 bg-slate-200`} />
          <span className={`${bar} h-4 w-32 bg-slate-200`} />
          <span className="h-6 w-40 motion-safe:animate-pulse rounded-full bg-slate-100" />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Vehicle details and records are seller-reported. BidLane has not independently verified ownership, history, or condition.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="aspect-[3/2] motion-safe:animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-slate-200" />
        </div>

        <aside className="space-y-5 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <section className="overflow-hidden rounded-2xl bg-slate-950 shadow-lg shadow-slate-950/10">
            <div className="space-y-4 p-5 sm:space-y-6 sm:p-6">
              <div className="flex h-11 items-center justify-between gap-3">
                <span className="h-6 w-28 motion-safe:animate-pulse rounded-full bg-white/15" />
              </div>
              <div>
                <div className={`${bar} mb-2 h-4 w-24 bg-white/10`} />
                <div className={`${bar} h-10 w-40 bg-white/15`} />
              </div>
              <div className="flex items-center justify-between gap-3 border-y border-white/10 py-4">
                <div className={`${bar} h-4 w-20 bg-white/10`} />
                <div className={`${bar} h-4 w-24 bg-white/15`} />
              </div>
              <div className="h-11 motion-safe:animate-pulse rounded-xl bg-amber-400/40" />
              <div className="flex gap-5">
                <div className={`${bar} h-4 w-16 bg-white/10`} />
                <div className={`${bar} h-4 w-24 bg-white/10`} />
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-bold tracking-tight">Vehicle at a Glance</h2>
            <dl className="divide-y divide-slate-100 text-sm">
              {glanceLabels.map((label) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className={`${bar} h-4 w-24 bg-slate-200`} />
                </div>
              ))}
            </dl>
          </section>
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">From the seller</p>
            <h2 className="mb-4 text-2xl font-bold tracking-tight">About This Vehicle</h2>
            <div className="max-w-3xl space-y-3 py-1.5">
              {["w-full", "w-full", "w-11/12", "w-full", "w-2/3"].map((width, index) => (
                <div key={index} className={`${bar} h-4 bg-slate-100 ${width}`} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-950">History &amp; condition</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Reported by the seller, not independently verified by BidLane. Ask for records and discuss any inspection before bidding.
            </p>
            <dl className="mt-5 space-y-5">
              {vehicleDisclosureFields.map(({ id, label }) => (
                <div key={id} className={id === "knownFlaws" ? "rounded-xl border border-amber-200 bg-amber-50 p-4" : ""}>
                  <dt className="text-sm font-bold text-slate-950">{label}</dt>
                  <dd className="mt-3 space-y-2">
                    <div className={`${bar} h-4 w-full bg-slate-100`} />
                    <div className={`${bar} h-4 w-3/5 bg-slate-100`} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Photo Gallery</h2>
              <div className={`${bar} h-3 w-14 bg-slate-200`} />
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl md:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="h-20 motion-safe:animate-pulse bg-slate-200 sm:h-24" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
