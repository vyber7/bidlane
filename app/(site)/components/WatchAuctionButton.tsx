"use client";

import type { Listing } from "@prisma/client";
import Link from "next/link";
import { FiCheck, FiStar } from "react-icons/fi";
import useWatchlist from "@/app/hooks/useWatchlist";

export default function WatchAuctionButton({ listing, currentUserId }: {
  listing: Listing;
  currentUserId?: string | null;
}) {
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUserId,
    initialWatching: Boolean(currentUserId && listing.watchersIds.includes(currentUserId)),
  });
  const className = "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-60";

  if (currentUserId === listing.userId) {
    return <Link href={`/listing/${listing.id}`} className={className}>View your listing</Link>;
  }
  if (!currentUserId) {
    return <Link href="/signin" className={className}><FiStar aria-hidden="true" />Sign in to watch</Link>;
  }
  return (
    <button type="button" onClick={toggle} disabled={isUpdating} aria-pressed={watching} className={className}>
      {watching ? <FiCheck aria-hidden="true" /> : <FiStar aria-hidden="true" />}{watching ? "Watching" : "Watch auction"}
    </button>
  );
}
