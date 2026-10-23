"use client";

import { FiSearch } from "react-icons/fi";
import { auctionSortOptions, type AuctionSort } from "@/app/libs/auction-filters";

interface AuctionSearchControlsProps {
  auctionType: string;
  query: string;
  sort: AuctionSort;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: AuctionSort) => void;
}

export default function AuctionSearchControls({ auctionType, query, sort, onQueryChange, onSortChange }: AuctionSearchControlsProps) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
      <label className="relative block min-w-0 flex-1 lg:w-64">
        <span className="sr-only">Search {auctionType} auctions</span>
        <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Search ${auctionType.toLowerCase()} auctions`}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        />
      </label>
      <label className="block sm:w-48">
        <span className="sr-only">Sort auctions</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as AuctionSort)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        >
          {auctionSortOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}
