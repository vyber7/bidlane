import { LoadingStatus } from "@/app/components/Skeleton";
// Mirrors app/sellers/[id]/page.tsx so the seller profile doesn't shift when it streams in.
// Static copy renders as-is; only seller data is a placeholder.

const bar = "motion-safe:animate-pulse rounded";

const sections = ["Latest current listings", "Sold at auction"];

export default function Loading() {
  return (
    <main
      className="mx-auto max-w-6xl space-y-7 px-4 pb-16 pt-28 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <LoadingStatus label="Loading seller profile" />
      {/* The back link depends on ?fromListing, which loading.tsx can't read. */}
      <div className="flex h-5 items-center">
        <div className={`${bar} h-4 w-32 bg-slate-200`} />
      </div>
      <header className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-start gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Seller profile</p>
            <div className="mt-1 flex h-9 items-center">
              <div className={`${bar} h-8 w-56 max-w-full bg-slate-200`} />
            </div>
            <div className="mt-2 flex h-5 items-center">
              <div className={`${bar} h-4 w-44 bg-slate-100`} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="h-7 w-28 motion-safe:animate-pulse rounded-full bg-slate-100" />
              <div className="h-7 w-48 motion-safe:animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="aspect-square w-full motion-safe:animate-pulse rounded-2xl bg-slate-200" />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Email verification confirms inbox access, not identity, ownership, or vehicle condition. Auction results do not confirm payment or vehicle handoff.
        </p>
      </header>
      {sections.map((title) => (
        <section key={title}>
          <h2 className="mb-4 text-xl font-bold">{title}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="aspect-[3/2] w-full motion-safe:animate-pulse bg-slate-200" />
                <div className="p-4">
                  <div className="flex h-6 items-center">
                    <div className={`${bar} h-5 w-2/3 bg-slate-200`} />
                  </div>
                  <div className="mt-1 flex h-5 items-center">
                    <div className={`${bar} h-4 w-1/3 bg-slate-100`} />
                  </div>
                  <div className="mt-3 flex h-5 items-center">
                    <div className={`${bar} h-4 w-1/2 bg-slate-100`} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
