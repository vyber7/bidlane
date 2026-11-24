import { Bone, Line, LoadingStatus } from "@/app/components/Skeleton";
import { vehicleSpecificationFields } from "@/app/libs/vehicle-details";

const detailLabels = ["Mileage", "Location", "VIN / chassis", "Reserve", ...vehicleSpecificationFields.map(({ label }) => label)];

// Mirrors the top of app/admin/listings/[id]/page.tsx: header, vehicle details,
// and cover photo. Sections below the fold aren't repeated.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-12 pt-24 sm:px-6 lg:px-8" aria-busy="true">
      <LoadingStatus label="Loading listing review" />
      <span className="text-sm font-bold underline"><span aria-hidden="true">←</span> Listing Reviews</span>
      <header>
        <Line><Bone className="h-4 w-40 bg-amber-100" /></Line>
        <Line className="mt-2 h-9"><Bone className="h-7 w-72 max-w-full" /></Line>
        <Line className="mt-3"><Bone className="h-4 w-80 max-w-full bg-slate-100" /></Line>
        <p className="mt-3 text-sm font-bold underline">View Listing Page <span aria-hidden="true">→</span></p>
      </header>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">Vehicle Details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {detailLabels.map((label) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <Line className="mt-1 h-6"><Bone className="h-4 w-32" /></Line>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 font-bold">Description</h3>
        <div className="mt-2 space-y-2">
          {["w-full", "w-full", "w-2/3"].map((width, index) => (
            <Bone key={index} className={`h-4 bg-slate-100 ${width}`} />
          ))}
        </div>
      </section>
      <Bone className="aspect-[3/2] w-full rounded-2xl border border-slate-200" />
    </div>
  );
}
