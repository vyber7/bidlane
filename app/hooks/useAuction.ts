"use client";

import type { PublicListing } from "@/app/libs/listing-codec";
import { auctionPhase, auctionStatusOrder, type AuctionPhase } from "@/app/libs/auction-lifecycle";
import { useState } from "react";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";
import type { AcceptedBidResponse } from "@/app/types/auction-events";
import useCountDown from "./useCountDown";
import { listingChannel } from "@/app/libs/realtime/catalog";
import { useRealtimeEvent, useRealtimeReady } from "@/app/libs/realtime/client";
import useAuctionRefresh from "./useAuctionRefresh";
import useAuctionFinalization from "./useAuctionFinalization";
import { describeAuction } from "@/app/libs/auction-display";

interface AuctionSnapshot<T extends PublicListing> {
  listing: T;
  bids: BidWithAuthor[];
  comments: CommentWithAuthor[];
}

const emptyBids: BidWithAuthor[] = [];
const emptyComments: CommentWithAuthor[] = [];
const statusRank = (status: string) => auctionStatusOrder.indexOf(status as (typeof auctionStatusOrder)[number]);

function mergeListing<T extends PublicListing>(previous: T, incoming: T): T {
  if (previous.id !== incoming.id) return incoming;

  // Bids, extensions, and lifecycle transitions only move forward. A refresh
  // started before a live event must not roll that newer event back.
  const keepBid = previous.currentBid !== null &&
    (incoming.currentBid === null || previous.currentBid > incoming.currentBid);
  const keepStatus = statusRank(previous.status) > statusRank(incoming.status);
  const keepEnd = previous.auctionEndsAt !== null &&
    (incoming.auctionEndsAt === null ||
      new Date(previous.auctionEndsAt).getTime() > new Date(incoming.auctionEndsAt).getTime());

  return {
    ...incoming,
    ...(keepBid && {
      currentBid: previous.currentBid,
      highestBidderId: previous.highestBidderId,
    }),
    ...(keepStatus && {
      status: previous.status,
      result: previous.result,
      auctionStartsAt: previous.auctionStartsAt,
      startingBid: previous.startingBid,
      bidIncrement: previous.bidIncrement,
    }),
    ...(keepEnd && { auctionEndsAt: previous.auctionEndsAt }),
  };
}

function mergeActivity<T extends { id: string }>(previous: T[], incoming: T[]) {
  return Array.from(new Map([...previous, ...incoming].map((item) => [item.id, item])).values());
}

export interface AuctionViewOptions {
  /** Who is looking: null or absent for an anonymous visitor. */
  viewerId?: string | null;
  /** Pass bids and comments only from views that show activity. */
  bids?: BidWithAuthor[];
  comments?: CommentWithAuthor[];
}

/**
 * The auction view: an Auction with its Real-time updates applied, its phase,
 * countdown and display for one viewer. While the Auction is Closing it also
 * asks for Finalization, shared with every other view of the same Auction.
 */
export default function useAuction<T extends PublicListing>(
  listing: T,
  { viewerId = null, bids = emptyBids, comments = emptyComments }: AuctionViewOptions = {},
) {
  const source = { listing, bids, comments };
  const [state, setState] = useState<{ source: AuctionSnapshot<T>; current: AuctionSnapshot<T> }>({
    source,
    current: source,
  });
  const refresh = useAuctionRefresh(listing.id);

  if (state.source.listing !== listing || state.source.bids !== bids || state.source.comments !== comments) {
    // Reconcile before rendering consumers, so an expired old deadline cannot
    // trigger finalization while refreshed props already contain an extension.
    const sameListing = state.current.listing.id === listing.id;
    setState({
      source,
      current: sameListing ? {
        listing: mergeListing(state.current.listing, listing),
        bids: mergeActivity(state.current.bids, bids),
        comments: mergeActivity(state.current.comments, comments),
      } : source,
    });
  }

  function updateListing(patch: Partial<PublicListing>) {
    setState((previous) => ({
      ...previous,
      current: {
        ...previous.current,
        listing: mergeListing(previous.current.listing, { ...previous.current.listing, ...patch }),
      },
    }));
  }

  function receiveBid(bid: BidWithAuthor, auctionEndsAt?: string) {
    if (bid.listingId !== listing.id) return;
    setState((previous) => ({
      ...previous,
      current: {
        ...previous.current,
        listing: mergeListing(previous.current.listing, {
          ...previous.current.listing,
          currentBid: bid.amount,
          highestBidderId: bid.userId,
          ...(auctionEndsAt && { auctionEndsAt: new Date(auctionEndsAt) }),
        }),
        bids: mergeActivity(previous.current.bids, [bid]),
      },
    }));
  }

  function receiveComment(comment: CommentWithAuthor) {
    if (comment.listingId !== listing.id) return;
    setState((previous) => ({
      ...previous,
      current: { ...previous.current, comments: mergeActivity(previous.current.comments, [comment]) },
    }));
  }

  const listingUpdatesChannel = listingChannel(listing.id);
  useRealtimeEvent(listingUpdatesChannel, "watcher-count-update", (event) => {
    if (event.listingId === listing.id) updateListing({ watcherCount: event.watcherCount });
  });
  useRealtimeEvent(listingUpdatesChannel, "new-bid", (bid) => {
    receiveBid(bid);
    refresh();
  });
  useRealtimeEvent(listingUpdatesChannel, "new-end-time", ({ newEndTime }) => {
    updateListing({ auctionEndsAt: new Date(newEndTime) });
  });
  useRealtimeEvent(listingUpdatesChannel, "auction-started", (event) => {
    updateListing({
      ...event,
      status: "LIVE",
      auctionStartsAt: new Date(event.auctionStartsAt),
      auctionEndsAt: new Date(event.auctionEndsAt),
    });
    refresh();
  });
  useRealtimeEvent(listingUpdatesChannel, "auction-ended", (event) => {
    updateListing({ status: "ENDED", result: event.result, auctionEndsAt: new Date(event.auctionEndsAt) });
    refresh();
  });
  // Only views that show activity (bids or comments) follow new comments.
  useRealtimeEvent(bids === emptyBids && comments === emptyComments ? null : listingUpdatesChannel, "new-comment", (comment) => {
    receiveComment(comment);
    refresh();
  });
  useRealtimeReady(listingUpdatesChannel, () => {
    // Recover events missed before subscribing or while disconnected.
    refresh();
  });

  const currentListing = state.current.listing;
  const { currentTime, ticking, ...countdown } = useCountDown(currentListing.status === "LIVE" ? currentListing.auctionEndsAt : null);
  // A ticking countdown means the phase depends on the clock; until the first
  // reading arrives the auction is syncing (null). Otherwise time is irrelevant.
  const phase: AuctionPhase | null = ticking && currentTime === null
    ? null
    : auctionPhase(currentListing, currentTime ?? 0);

  const finalization = useAuctionFinalization({
    listingId: currentListing.id,
    deadline: currentListing.auctionEndsAt,
    closing: phase?.phase === "closing",
    refresh,
  });

  return {
    ...state.current,
    ...countdown,
    phase,
    viewerId,
    display: describeAuction(currentListing, phase, viewerId),
    finalization,
    acceptBid: ({ bid, auctionEndsAt }: AcceptedBidResponse) => receiveBid(bid, auctionEndsAt),
    acceptComment: receiveComment,
  };
}
