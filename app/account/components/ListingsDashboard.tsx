"use client";

import type { PublicListing, SellerListing } from "@/app/libs/listing-payload";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { startTransition, useMemo, useOptimistic, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  FiArrowUpRight,
  FiEye,
  FiGrid,
  FiPlus,
  FiSearch,
  FiZap,
} from "react-icons/fi";
import { userChannel } from "@/app/libs/realtime/catalog";
import { useRealtimeEvent } from "@/app/libs/realtime/client";
import { deserializeListing } from "@/app/utils/listing-serialization";
import AccountListingBox from "./AccountListingBox";
import AccountTabs, { updateAccountUrl } from "./AccountTabs";
import useUndo from "@/app/hooks/useUndo";
import UndoNotice from "@/app/components/UndoNotice";
import { getApiErrorMessage } from "@/app/utils/api-error";
import type { WatchlistResponse } from "@/app/types/auction-events";

/** How long a local Watchlist change outranks contradicting Real-time updates. */
const WATCH_INTENT_MS = 30_000;
type WatchIntents = Map<string, { watching: boolean; until: number }>;

function recordIntent(intents: WatchIntents, listingId: string, watching: boolean) {
  intents.set(listingId, { watching, until: Date.now() + WATCH_INTENT_MS });
}

/** A Real-time update that contradicts the latest local change is a stale echo of an earlier one. */
function isStaleEcho(intents: WatchIntents, listingId: string, watching: boolean) {
  const intent = intents.get(listingId);
  if (intent && intent.until > Date.now() && intent.watching !== watching) return true;
  intents.delete(listingId);
  return false;
}

interface ListingsDashboardProps {
  uploaded: SellerListing[];
  initialWatching: PublicListing[];
  currentUserId?: string | null;
}

type Tab = "uploaded" | "watching";
const filters = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "ended", label: "Ended" },
] as const;
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

const ListingsDashboard: React.FC<ListingsDashboardProps> = ({
  uploaded,
  initialWatching,
  currentUserId,
}) => {
  const searchInput = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "watching" ? "watching" : "uploaded";
  const status = filters.find((filter) => filter.id === params.get("status"))?.id ?? "all";
  const [query, setOptimisticQuery] = useOptimistic(params.get("q") ?? "");
  const [watchlist, setWatchlist] = useState({ source: initialWatching, listings: initialWatching });
  if (watchlist.source !== initialWatching) {
    setWatchlist({ source: initialWatching, listings: initialWatching });
  }
  const watching = watchlist.listings;
  const watchUndo = useUndo();
  // Local removals and undos run in order per Listing, and Real-time updates
  // that contradict the latest local change are stale echoes of an earlier one.
  const watchIntents = useRef<WatchIntents>(new Map());
  const watchRequests = useRef(new Map<string, Promise<unknown>>());

  function insertWatched(listing: PublicListing, index: number) {
    setWatchlist((current) => current.listings.some((item) => item.id === listing.id) ? current : {
      ...current,
      listings: [...current.listings.slice(0, index), listing, ...current.listings.slice(index)],
    });
  }

  function dropWatched(listingId: string) {
    setWatchlist((current) => ({ ...current, listings: current.listings.filter((item) => item.id !== listingId) }));
  }

  function saveWatching(listingId: string, desired: boolean) {
    recordIntent(watchIntents.current, listingId, desired);
    const previous = watchRequests.current.get(listingId) ?? Promise.resolve();
    const request = previous.catch(() => undefined).then(() =>
      axios.post<WatchlistResponse>("/api/update-watchlist", { listingId, watching: desired }));
    watchRequests.current.set(listingId, request);
    return request.catch((error: unknown) => {
      if (watchIntents.current.get(listingId)?.watching === desired) watchIntents.current.delete(listingId);
      throw error;
    });
  }

  function removeFromWatchlist(listing: PublicListing) {
    const index = watching.findIndex((item) => item.id === listing.id);
    const title = `${listing.year} ${listing.make} ${listing.model}`;
    dropWatched(listing.id);
    watchUndo.offer(`${title} removed from your Watchlist.`, () => {
      insertWatched(listing, index);
      saveWatching(listing.id, true).catch((error: unknown) => {
        dropWatched(listing.id);
        toast.error(getApiErrorMessage(error, "The Watchlist could not be updated. Please try again."));
      });
    });
    saveWatching(listing.id, false).catch((error: unknown) => {
      watchUndo.dismiss();
      insertWatched(listing, index);
      toast.error(getApiErrorMessage(error, "The Watchlist could not be updated. Please try again."));
    });
  }

  useRealtimeEvent(
    currentUserId ? userChannel(currentUserId) : null,
    "watching-update",
    ({ listing: payload, watching: isWatching }) => {
      const listing = deserializeListing(payload);
      if (isStaleEcho(watchIntents.current, listing.id, isWatching)) return;
      setWatchlist((current) => ({
        ...current,
        listings: !isWatching
          ? current.listings.filter((item) => item.id !== listing.id)
          : current.listings.some((item) => item.id === listing.id)
            ? current.listings
            : [listing, ...current.listings],
      }));
    }
  );

  const source = tab === "uploaded" ? uploaded : watching;
  const visibleListings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return source.filter((listing) => {
      const matchesStatus = status === "all" || listing.status.toLowerCase() === status;
      const searchable = `${listing.year} ${listing.make} ${listing.model} ${listing.location}`.toLowerCase();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, source, status]);

  const liveCount = uploaded.filter((listing) => listing.status === "LIVE").length;
  const changeTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    updateAccountUrl({ tab: nextTab === "watching" ? nextTab : "", status: "", q: "" });
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
            className={`${focusRing} inline-flex w-fit items-center gap-2 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800`}
          >
            <FiPlus aria-hidden="true" className="text-base" /> Sell a Vehicle
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-gray-200 bg-gray-50/80">
        <Stat icon={<FiGrid />} label="Submitted" value={uploaded.length} />
        <Stat icon={<FiZap />} label="Live now" value={liveCount} />
        <Stat icon={<FiEye />} label="Watching" value={watching.length} />
      </div>

      <AccountTabs<Tab>
        label="Your listings"
        tabs={[
          { id: "uploaded", label: "My Vehicles", count: uploaded.length },
          { id: "watching", label: "Watchlist", count: watching.length },
        ]}
        selected={tab}
        onChange={changeTab}
      >
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter listings by status">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={status === filter.id}
                onClick={() => updateAccountUrl({ status: filter.id === "all" ? "" : filter.id })}
                className={`${focusRing} whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
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
            <FiSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchInput}
              type="search"
              name="q"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                startTransition(() => {
                  setOptimisticQuery(value);
                  updateAccountUrl({ q: value }, true);
                });
              }}
              placeholder="e.g. Porsche 911…"
              className={`${focusRing} w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:bg-white`}
            />
          </label>
        </div>

        <p role="status" className="sr-only">
          {visibleListings.length} {visibleListings.length === 1 ? "listing" : "listings"} found
        </p>
        {tab === "watching" && <UndoNotice notice={watchUndo.notice} onUndo={watchUndo.undo} className="border-b border-gray-200 bg-amber-50 px-4 py-3 sm:px-6" />}
        {visibleListings.length ? (
          <ul className="divide-y divide-gray-200">
            {visibleListings.map((listing) => (
              <li key={listing.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_24rem] sm:[contain-intrinsic-size:auto_13rem]">
                <AccountListingBox
                  listing={listing}
                  currentUserId={currentUserId}
                  uploaded={tab === "uploaded"}
                  onRemove={tab === "watching" ? () => removeFromWatchlist(listing) : undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            tab={tab}
            filtered={Boolean(query) || status !== "all"}
            onClear={() => {
              searchInput.current?.focus();
              updateAccountUrl({ status: "", q: "" });
            }}
          />
        )}
      </AccountTabs>
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
      <span aria-hidden="true" className="hidden text-base sm:inline">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-950">{value}</p>
  </div>
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
    <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500">
      {tab === "uploaded" ? <FiGrid /> : <FiEye />}
    </div>
    <h3 className="mt-4 text-base font-bold text-gray-950">
      {filtered
        ? "No Listings Match Your Filters"
        : tab === "uploaded"
          ? "Your Garage Is Empty"
          : "Nothing on Your Watchlist Yet"}
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
        className={`${focusRing} mt-5 text-sm font-bold text-gray-950 hover:underline`}
      >
        Clear Filters
      </button>
    ) : (
      <Link
        href={tab === "uploaded" ? "/submit-listing" : "/?status=live#auctions"}
        className={`${focusRing} mt-5 inline-flex items-center gap-1 text-sm font-bold text-gray-950 hover:underline`}
      >
        {tab === "uploaded" ? "Submit a Vehicle" : "Browse Auctions"} <FiArrowUpRight aria-hidden="true" />
      </Link>
    )}
  </div>
);

export default ListingsDashboard;
