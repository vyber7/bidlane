"use client";

import type { Listing } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";
import useCountDown from "./useCountDown";
import usePusherEvent from "./usePusherEvent";

interface AuctionSnapshot {
  listing: Listing;
  bids: BidWithAuthor[];
  comments: CommentWithAuthor[];
}

interface AuctionStarted {
  auctionStartsAt: string;
  auctionEndsAt: string;
  startingBid: number;
  bidIncrement: number;
}

export interface AcceptedBid {
  bid: BidWithAuthor;
  auctionEndsAt: string;
}

const emptyBids: BidWithAuthor[] = [];
const emptyComments: CommentWithAuthor[] = [];
const statusOrder = ["UPCOMING", "LIVE", "ENDED"];

function mergeListing(previous: Listing, incoming: Listing): Listing {
  if (previous.id !== incoming.id) return incoming;

  // Bids, extensions, and lifecycle transitions only move forward. A refresh
  // started before a live event must not roll that newer event back.
  const keepBid = previous.currentBid !== null &&
    (incoming.currentBid === null || previous.currentBid > incoming.currentBid);
  const keepStatus = statusOrder.indexOf(previous.status) > statusOrder.indexOf(incoming.status);
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

export default function useAuction(
  listing: Listing,
  bids = emptyBids,
  comments = emptyComments
) {
  const source = { listing, bids, comments };
  const [state, setState] = useState<{ source: AuctionSnapshot; current: AuctionSnapshot }>({
    source,
    current: source,
  });
  const router = useRouter();

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

  function updateListing(patch: Partial<Listing>) {
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

  const channel = `listing-${listing.id}`;
  usePusherEvent<BidWithAuthor>(channel, "new-bid", (bid) => {
    receiveBid(bid);
    router.refresh();
  });
  usePusherEvent<{ newEndTime: string }>(channel, "new-end-time", ({ newEndTime }) => {
    updateListing({ auctionEndsAt: new Date(newEndTime) });
  });
  usePusherEvent<AuctionStarted>(channel, "auction-started", (event) => {
    updateListing({
      ...event,
      status: "LIVE",
      auctionStartsAt: new Date(event.auctionStartsAt),
      auctionEndsAt: new Date(event.auctionEndsAt),
    });
    router.refresh();
  });
  usePusherEvent<{ result: string; auctionEndsAt: string }>(channel, "auction-ended", (event) => {
    updateListing({ status: "ENDED", result: event.result, auctionEndsAt: new Date(event.auctionEndsAt) });
    router.refresh();
  });
  usePusherEvent<CommentWithAuthor>(bids === emptyBids && comments === emptyComments ? null : channel, "new-comment", (comment) => {
    receiveComment(comment);
    router.refresh();
  });
  usePusherEvent(channel, "pusher:subscription_succeeded", () => {
    // Recover events missed before subscribing or while disconnected.
    router.refresh();
  });

  return {
    ...state.current,
    ...useCountDown(state.current.listing.status === "LIVE" ? state.current.listing.auctionEndsAt : null),
    acceptBid: ({ bid, auctionEndsAt }: AcceptedBid) => receiveBid(bid, auctionEndsAt),
    acceptComment: receiveComment,
  };
}
