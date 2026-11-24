import { LoadingStatus } from "@/app/components/Skeleton";
import { FiArrowRight, FiCheckCircle, FiClock, FiTag, FiZap } from "react-icons/fi";

// Mirrors app/(site)/page.tsx so the homepage doesn't shift when it streams in.
// Static copy renders as-is; only data-driven parts are placeholders.

const heroStats = ["Live now", "No reserve", "Coming soon", "Results"];

const inventoryTabs = [
  { label: "Live", icon: FiZap },
  { label: "No reserve", icon: FiTag },
  { label: "Coming soon", icon: FiClock },
  { label: "Results", icon: FiCheckCircle },
];

export default function Loading() {
  return (
    <div
      className="bg-stone-50 pb-16 pt-[var(--site-nav-height)]"
      aria-busy="true"
    >
      <LoadingStatus label="Loading auctions" />
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.18),transparent_34%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12 lg:px-8">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">
              <span className="h-px w-8 bg-amber-400" /> Enthusiast car auctions
            </p>
            <h1 className="max-w-xl text-balance text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              Great cars. Worth the chase.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
              Discover enthusiast cars, follow the bidding, and make your next
              great drive yours.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="h-11 w-44 motion-safe:animate-pulse rounded-full bg-amber-400/60 sm:w-52" />
              <div className="inline-flex min-h-11 items-center rounded-full px-1 py-3 text-xs font-semibold text-slate-300 sm:border sm:border-white/25 sm:px-4 sm:text-sm">
                Sell Your Vehicle
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-2">
            <ul className="grid grid-cols-2 gap-2">
              {heroStats.map((label) => (
                <li key={label} className="flex min-h-11 flex-col px-3 py-3">
                  <span className="flex h-9 items-center">
                    <span className="h-7 w-10 motion-safe:animate-pulse rounded bg-white/15" />
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300 sm:text-sm">
                    {label} <FiArrowRight aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-8 sm:px-6 lg:px-8">
        {/* Featured auction */}
        <div className="grid min-w-0 overflow-hidden rounded-2xl bg-slate-950 lg:grid-cols-[3fr_2fr]">
          <div className="aspect-[16/10] motion-safe:animate-pulse bg-slate-800" />
          <div className="flex min-w-0 flex-col p-5 sm:p-6 lg:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              Featured auction
            </p>
            <div className="mt-3 h-6 w-3/4 motion-safe:animate-pulse rounded bg-white/15 sm:h-7" />
            <div className="mt-3 h-4 w-1/2 motion-safe:animate-pulse rounded bg-white/10" />
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 lg:mt-auto">
              <div className="space-y-2">
                <div className="h-6 w-36 motion-safe:animate-pulse rounded bg-white/15" />
                <div className="h-4 w-24 motion-safe:animate-pulse rounded bg-amber-400/30" />
              </div>
              <div className="h-5 w-24 motion-safe:animate-pulse rounded bg-amber-400/30" />
            </div>
          </div>
        </div>

        {/* Latest bids */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Latest Bids</h2>
          <ul className="mt-3 grid auto-cols-[min(76%,15rem)] grid-flow-col grid-rows-2 gap-x-4 gap-y-3 overflow-hidden pb-1 lg:grid-flow-row lg:grid-cols-5 lg:grid-rows-none">
            {Array.from({ length: 10 }, (_, index) => (
              <li key={index} className="space-y-2 border-l-2 border-amber-400 py-0.5 pl-3">
                <div className="h-4 w-3/4 motion-safe:animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-full motion-safe:animate-pulse rounded bg-slate-100" />
              </li>
            ))}
          </ul>
        </section>

        {/* Inventory */}
        <section>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Inventory</h2>
          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 max-w-full gap-2 overflow-hidden pb-1 xl:shrink-0">
              {inventoryTabs.map(({ label, icon: Icon }, index) => (
                <div
                  key={label}
                  className={`flex min-h-11 shrink-0 items-center justify-between gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold sm:justify-start sm:gap-3 sm:px-4 sm:text-sm xl:gap-2 xl:px-3 ${
                    index === 0
                      ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-1 whitespace-nowrap sm:gap-2">
                    <Icon aria-hidden="true" className={`shrink-0 ${index === 0 ? "text-amber-500" : ""}`} />
                    {label}
                  </span>
                  <span
                    className={`h-5 w-6 shrink-0 motion-safe:animate-pulse rounded-full ${
                      index === 0 ? "bg-white/15" : "bg-slate-100"
                    }`}
                  />
                </div>
              ))}
            </div>
            <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto xl:min-w-0 xl:flex-1">
              <div className="h-[42px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-white lg:w-64" />
              <div className="h-[42px] rounded-xl border border-slate-200 bg-white sm:w-48 sm:shrink-0" />
            </div>
          </div>

          <ul className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <li
                key={index}
                className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="p-2">
                  <div className="h-6 w-2/3 motion-safe:animate-pulse rounded bg-slate-200" />
                </div>
                <div className="aspect-[16/10] motion-safe:animate-pulse bg-slate-200" />
                <div className="flex min-h-10 items-center justify-between bg-slate-950 px-3 py-2">
                  <div className="h-3 w-16 motion-safe:animate-pulse rounded bg-white/20" />
                  <div className="h-3 w-24 motion-safe:animate-pulse rounded bg-white/20" />
                </div>
                <div className="space-y-2 px-3 py-3">
                  <div className="h-4 w-full motion-safe:animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-5/6 motion-safe:animate-pulse rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-1/2 motion-safe:animate-pulse rounded bg-slate-100" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
