"use client";

import { Listing, User } from "@prisma/client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FiArrowUpRight,
  FiEye,
  FiGrid,
  FiPlus,
  FiSearch,
  FiZap,
} from "react-icons/fi";
import usePusherEvent from "@/app/hooks/usePusherEvent";
import AccountListingBox from "./AccountListingBox";

interface ListingsDashboardProps {
  uploaded: Listing[];
  initialWatching: Listing[];
  currentUser: User | null;
}

interface WatchingUpdate {
  listing: Listing;
  watching: boolean;
}

type Tab = "uploaded" | "watching";
type StatusFilter = "ALL" | "LIVE" | "UPCOMING" | "ENDED";

const ListingsDashboard: React.FC<ListingsDashboardProps> = ({
  uploaded,
  initialWatching,
  currentUser,
}) => {
  const [tab, setTab] = useState<Tab>("uploaded");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [watching, setWatching] = useState(initialWatching);

  usePusherEvent<WatchingUpdate>(
    currentUser?.id ? `user-${currentUser.id}-watching` : null,
    "watching-update",
    ({ listing, watching: isWatching }) => {
      setWatching((current) => {
        if (!isWatching) return current.filter((item) => item.id !== listing.id);
        if (current.some((item) => item.id === listing.id)) return current;
        return [listing, ...current];
      });
    }
  );

  const source = tab === "uploaded" ? uploaded : watching;
  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return source.filter((listing) => {
      const matchesStatus = status === "ALL" || listing.status === status;
      const searchable = `${listing.year} ${listing.make} ${listing.model} ${listing.location}`.toLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, source, status]);

  const liveCount = uploaded.filter((listing) => listing.status === "LIVE").length;
  const filters: { id: StatusFilter; label: string }[] = [
    { id: "ALL", label: "All" },
    { id: "LIVE", label: "Live" },
    { id: "UPCOMING", label: "Upcoming" },
    { id: "ENDED", label: "Ended" },
  ];

  const changeTab = (nextTab: Tab) => {
    setTab(nextTab);
    setStatus("ALL");
    setQuery("");
  };

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Your garage
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-950">
              Listings
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage your vehicles and keep an eye on auctions you love.
            </p>
          </div>
          <Link
            href="/submit-listing"
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800"
          >
            <FiPlus className="text-base" /> Sell a vehicle
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50/80">
        <Stat icon={<FiGrid />} label="Submitted" value={uploaded.length} />
        <Stat icon={<FiZap />} label="Live now" value={liveCount} />
        <Stat icon={<FiEye />} label="Watching" value={watching.length} />
      </div>

      <div className="border-b border-gray-200 px-4 sm:px-6">
        <div className="flex gap-6" role="tablist" aria-label="Your listings">
          <TabButton
            active={tab === "uploaded"}
            count={uploaded.length}
            onClick={() => changeTab("uploaded")}
          >
            My vehicles
          </TabButton>
          <TabButton
            active={tab === "watching"}
            count={watching.length}
            onClick={() => changeTab("watching")}
          >
            Watchlist
          </TabButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex gap-1 overflow-x-auto" aria-label="Filter listings by status">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                status === filter.id
                  ? "bg-gray-950 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-950"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search listings</span>
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search make, model, location"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-200"
          />
        </label>
      </div>

      {visibleListings.length ? (
        <ul className="divide-y divide-gray-200">
          {visibleListings.map((listing) => (
            <li key={listing.id}>
              <AccountListingBox
                listing={listing}
                currentUser={currentUser}
                watching={watching.some((item) => item.id === listing.id)}
                uploaded={tab === "uploaded"}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          tab={tab}
          filtered={Boolean(query) || status !== "ALL"}
          onClear={() => {
            setQuery("");
            setStatus("ALL");
          }}
        />
      )}
    </section>
  );
};

const Stat = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) => (
  <div className="border-r border-gray-200 px-3 py-4 last:border-r-0 sm:px-6">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 sm:text-xs">
      <span className="hidden text-base sm:inline">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{value}</p>
  </div>
);

const TabButton = ({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`border-b-2 py-4 text-sm font-bold transition-colors ${
      active
        ? "border-gray-950 text-gray-950"
        : "border-transparent text-gray-500 hover:text-gray-900"
    }`}
  >
    {children}
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
        active ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600"
      }`}
    >
      {count}
    </span>
  </button>
);

const EmptyState = ({
  tab,
  filtered,
  onClear,
}: {
  tab: Tab;
  filtered: boolean;
  onClear: () => void;
}) => (
  <div className="px-6 py-16 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500">
      {tab === "uploaded" ? <FiGrid /> : <FiEye />}
    </div>
    <h3 className="mt-4 text-base font-bold text-gray-950">
      {filtered
        ? "No listings match your filters"
        : tab === "uploaded"
          ? "Your garage is empty"
          : "Nothing on your watchlist yet"}
    </h3>
    <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
      {filtered
        ? "Try another search or clear the status filter."
        : tab === "uploaded"
          ? "Submit your first vehicle and follow it from review to final bid."
          : "Save interesting auctions and they’ll stay organized here."}
    </p>
    {filtered ? (
      <button
        type="button"
        onClick={onClear}
        className="mt-5 text-sm font-bold text-gray-950 hover:underline"
      >
        Clear filters
      </button>
    ) : (
      <Link
        href={tab === "uploaded" ? "/submit-listing" : "/live/listings"}
        className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-gray-950 hover:underline"
      >
        {tab === "uploaded" ? "Submit a vehicle" : "Browse auctions"} <FiArrowUpRight />
      </Link>
    )}
  </div>
);

export default ListingsDashboard;
