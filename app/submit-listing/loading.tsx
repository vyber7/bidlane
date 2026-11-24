import { FiArrowRight } from "react-icons/fi";
import { Bone, LoadingStatus } from "@/app/components/Skeleton";
import { vehicleSpecificationFields } from "@/app/libs/vehicle-details";

const steps = ["Details", "Condition", "Photos", "Preview"];
const fieldLabels = [
  "VIN or chassis number (optional)",
  "Make",
  "Model",
  "Year",
  "Mileage",
  "Reserve price in USD (optional)",
  "Location",
];

// Mirrors app/submit-listing/page.tsx on its first step. A resumed draft may
// open on a later step, which loading.tsx can't know.
export default function Loading() {
  return (
    <div
      className="mx-auto grid min-h-lvh max-w-6xl gap-10 px-4 pb-10 pt-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8"
      aria-busy="true"
    >
      <LoadingStatus label="Loading listing form" />
      <main className="w-full rounded-md lg:p-0">
        <h1 className="pb-2 text-3xl font-bold">Submit Your Vehicle</h1>
        <p className="mb-6 text-sm text-slate-500">Add your details and photos, then preview your listing before submitting. Your draft saves as you work. Submitted listings need admin approval before they appear publicly or bidding can open.</p>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
          <div className="mb-6 rounded-xl border border-slate-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">Private listing draft</p>
              <div className="flex flex-wrap gap-2">
                {["Save Draft", "Save & Exit"].map((label) => (
                  <span key={label} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold opacity-50">{label}</span>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Changes save automatically. Wait for “Draft saved” before leaving, or use Save &amp; exit. Drafts aren’t listed publicly; find them in Account → Listings.</p>
          </div>
          <ol className="mb-8 grid grid-cols-4 gap-2">
            {steps.map((label, index) => (
              <li key={label} className={`border-t-4 pt-3 text-xs sm:text-sm ${index === 0 ? "border-amber-500 font-bold text-slate-900" : "border-slate-200 text-slate-500"}`}>
                <span className="block text-xs">Step {index + 1}</span>{label}
              </li>
            ))}
          </ol>
          <h2 className="mb-2 text-xl font-bold">Vehicle Details</h2>
          <p className="mb-6 text-sm leading-6 text-slate-500">Tell buyers about your vehicle. All details are required except the VIN and reserve price. You can edit everything before submitting.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {fieldLabels.map((label) => (
              <div key={label}>
                <p className="mb-2 text-sm font-semibold">{label}</p>
                <Bone className="h-11 rounded-lg border border-slate-300 bg-white sm:h-10" />
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {vehicleSpecificationFields.map(({ label }) => (
              <div key={label}>
                <p className="mb-2 text-sm font-semibold">{label}</p>
                <Bone className="h-11 rounded-lg border border-slate-300 bg-white sm:h-10" />
              </div>
            ))}
          </div>
        </div>
      </main>
      <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:sticky lg:top-20">
        <h2 className="mt-2 text-xl font-bold text-slate-950">Recently Sold</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="grid grid-cols-[6.5rem_1fr] overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="min-h-24 motion-safe:animate-pulse bg-slate-200" />
              <div className="space-y-2 p-3">
                <Bone className="h-4 w-full" />
                <Bone className="h-3 w-14 bg-slate-100" />
                <Bone className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-slate-200 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-950">
            View All Results <FiArrowRight aria-hidden="true" />
          </span>
        </div>
      </aside>
    </div>
  );
}
