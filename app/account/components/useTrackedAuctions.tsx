"use client";

import { useCallback, useEffect, useState } from "react";
import useAuction from "@/app/hooks/useAuction";
import type { PublicListing } from "@/app/libs/listing-codec";
import { auctionGroup, listingGroup, type AuctionGroup } from "@/app/libs/listing-capabilities";

// The account dashboards file Auctions by the same state their cards show,
// with Real-time updates applied. One tracker per Auction follows its Real-time updates through
// useAuction, including Auctions a filter currently hides, so an Auction can
// move into view as well as out of it. Real-time updates can be missed; the
// next load (or the route refresh useAuction requests) corrects them.

export interface TrackedAuction<T extends PublicListing> {
  /** The Auction with every Real-time update received so far applied. */
  listing: T;
  group: AuctionGroup;
}

type Report<T extends PublicListing> = (id: string, tracked: TrackedAuction<T>) => void;

function AuctionTracker<T extends PublicListing>({ listing, onChange }: { listing: T; onChange: Report<T> }) {
  const { listing: current, phase } = useAuction(listing);
  const group = auctionGroup(phase);
  useEffect(() => onChange(listing.id, { listing: current, group }), [listing.id, current, group, onChange]);
  return null;
}

/** Follows each Auction in one list. Call once per list, so each keeps its own copy of a Listing. */
export default function useTrackedAuctions<T extends PublicListing>(listings: readonly T[]) {
  const [tracked, setTracked] = useState(() => new Map<string, TrackedAuction<T>>());
  const [loadedAt] = useState(Date.now);
  const report = useCallback<Report<T>>((id, auction) => setTracked((previous) => {
    const known = previous.get(id);
    return known?.listing === auction.listing && known.group === auction.group ? previous : new Map(previous).set(id, auction);
  }), []);

  const trackers = listings.map((listing) => (
    <AuctionTracker key={listing.id} listing={listing} onChange={report} />
  ));

  /** An Auction in `listings` with its Real-time updates applied, or as loaded until its tracker reports. */
  const current = (listing: T): TrackedAuction<T> =>
    tracked.get(listing.id) ?? { listing, group: listingGroup(listing, loadedAt) };

  return { trackers, current };
}
