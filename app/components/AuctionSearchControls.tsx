"use client";

import { FiSearch } from "react-icons/fi";
import {
  auctionSortOptions,
  type AuctionSort,
} from "@/app/libs/auction-inventory";

interface AuctionSearchControlsProps {
  auctionType: string;
  query: string;
  sort: AuctionSort;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: AuctionSort) => void;
}

export default function AuctionSearchControls({
  auctionType,
  query,
  sort,
  onQueryChange,
  onSortChange,
}: AuctionSearchControlsProps) {
  return (
    <div className="flex w-full flex-col gap-4 sm:flex-row lg:w-auto xl:min-w-0 xl:flex-1">
      <label className="relative block min-w-0 flex-1 lg:w-64">
        <span className="sr-only">Search {auctionType} auctions</span>
        <FiSearch aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          name="q"
          autoComplete="off"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="e.g. Porsche 911…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 placeholder:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        />
      </label>
      <label className="block sm:w-48 sm:shrink-0">
        <span className="sr-only">Sort auctions</span>
        <select
          name="sort"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as AuctionSort)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        >
          {auctionSortOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
