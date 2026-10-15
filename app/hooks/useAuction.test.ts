// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";
import { auctionNow, makeBid, makeComment, makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  channels: new Map<string, Map<string, Set<(data: unknown) => void>>>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/libs/pusher-channels", () => ({
  acquirePusherChannel: (name: string) => {
    const events = mocks.channels.get(name) ?? new Map<string, Set<(data: unknown) => void>>();
    mocks.channels.set(name, events);
    return {
      bind: (event: string, handler: (data: unknown) => void) => {
        const handlers = events.get(event) ?? new Set();
        handlers.add(handler);
        events.set(event, handlers);
      },
      unbind: (event: string, handler: (data: unknown) => void) => events.get(event)?.delete(handler),
    };
  },
  releasePusherChannel: vi.fn(),
}));

import useAuction from "./useAuction";

function emit(event: string, payload: unknown, listingId = makeListing().id) {
  act(() => {
    mocks.channels.get(`listing-${listingId}`)?.get(event)?.forEach((handler) => handler(payload));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  mocks.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  mocks.channels.clear();
  vi.useRealTimers();
});

describe("auction state reconciliation", () => {
  it("recovers bids, activity, and an extension from refreshed props after missed events", () => {
    const { result, rerender } = renderHook((props) => useAuction(props.listing, props.bids, props.comments), {
      initialProps: { listing: makeListing(), bids: [] as BidWithAuthor[], comments: [] as CommentWithAuthor[] },
    });
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.expired).toBe(true);

    const bid = makeBid();
    const comment = makeComment();
    const extended = new Date(Date.now() + 120000);
    rerender({
      listing: makeListing({ currentBid: bid.amount, highestBidderId: bid.userId, auctionEndsAt: extended }),
      bids: [bid], comments: [comment],
    });
    expect(result.current.listing.currentBid).toBe(12000);
    expect(result.current.listing.highestBidderId).toBe("buyer");
    expect(result.current.bids).toEqual([bid]);
    expect(result.current.comments).toEqual([comment]);
    expect(result.current.remainingMs).toBe(120000);
    expect(result.current.expired).toBe(false);
  });

  it("keeps a newer live bid and deadline when a stale refresh or older event arrives", () => {
    const initial = makeListing();
    const { result, rerender } = renderHook(({ listing }) => useAuction(listing), { initialProps: { listing: initial } });
    const bid = makeBid();
    const extended = new Date(auctionNow.getTime() + 180000).toISOString();
    emit("new-bid", bid);
    emit("new-end-time", { newEndTime: extended });
    rerender({ listing: { ...initial } });
    emit("new-bid", makeBid({ id: "older-bid", amount: 11000, userId: "other" }));
    emit("new-end-time", { newEndTime: initial.auctionEndsAt!.toISOString() });

    expect(result.current.listing.currentBid).toBe(12000);
    expect(result.current.listing.highestBidderId).toBe("buyer");
    expect(result.current.remainingMs).toBe(180000);
  });

  it("uses successful bid responses without needing a live notification and deduplicates echoes", () => {
    const listing = makeListing();
    const { result, rerender } = renderHook((props) => useAuction(props.listing, props.bids), {
      initialProps: { listing, bids: [] as BidWithAuthor[] },
    });
    const bid = makeBid();
    act(() => result.current.acceptBid({ bid, auctionEndsAt: new Date(Date.now() + 120000).toISOString() }));
    expect(result.current.listing.currentBid).toBe(bid.amount);
    expect(result.current.remainingMs).toBe(120000);
    emit("new-bid", bid);
    rerender({ listing: { ...listing, currentBid: bid.amount }, bids: [bid] });
    expect(result.current.bids).toEqual([bid]);
  });

  it("does not roll a started or ended auction back on a stale refresh", () => {
    const upcoming = makeListing({ status: "UPCOMING", auctionStartsAt: null, auctionEndsAt: null, startingBid: null, bidIncrement: null });
    const { result, rerender } = renderHook(({ listing }) => useAuction(listing), { initialProps: { listing: upcoming } });
    const end = new Date(Date.now() + 120000).toISOString();
    emit("auction-started", { auctionStartsAt: auctionNow.toISOString(), auctionEndsAt: end, startingBid: 10000, bidIncrement: 500 });
    rerender({ listing: { ...upcoming } });
    expect(result.current.listing).toMatchObject({ status: "LIVE", startingBid: 10000, bidIncrement: 500, auctionStartsAt: auctionNow });
    emit("auction-ended", { result: "RESERVE_NOT_MET", auctionEndsAt: end });
    rerender({ listing: { ...upcoming } });
    expect(result.current.listing).toMatchObject({ status: "ENDED", result: "RESERVE_NOT_MET" });
  });

  it("resets auction state and subscriptions when switching listings", () => {
    const { result, rerender } = renderHook(({ listing }) => useAuction(listing), { initialProps: { listing: makeListing() } });
    emit("new-bid", makeBid());
    const other = makeListing({ id: "abcdef0123456789abcdef02", status: "UPCOMING", auctionEndsAt: null });
    rerender({ listing: other });
    emit("new-bid", makeBid({ amount: 15000 }));
    expect(result.current.listing).toEqual(other);
    expect(result.current.bids).toEqual([]);
    expect(result.current.remainingMs).toBeNull();
  });

  it("does not run countdown clocks for upcoming or ended auctions", () => {
    const { rerender } = renderHook(({ listing }) => useAuction(listing), {
      initialProps: { listing: makeListing({ status: "UPCOMING" }) },
    });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ listing: makeListing({ status: "LIVE" }) });
    expect(vi.getTimerCount()).toBe(1);
    emit("auction-ended", { result: "RESERVE_NOT_MET", auctionEndsAt: auctionNow.toISOString() });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("merges HTTP, live, and refreshed comments without losing or duplicating activity", () => {
    const listing = makeListing();
    const bids: BidWithAuthor[] = [];
    const { result, rerender } = renderHook((props) => useAuction(props.listing, bids, props.comments), {
      initialProps: { listing, comments: [] as CommentWithAuthor[] },
    });
    const comment = makeComment();
    act(() => result.current.acceptComment(comment));
    emit("new-comment", comment);
    rerender({ listing: { ...listing }, comments: [comment, makeComment({ id: "missed-comment" })] });
    expect(result.current.comments).toHaveLength(2);
  });

  it("refreshes when subscribing and reconnecting, and releases listeners on unmount", () => {
    const listing = makeListing();
    const { unmount } = renderHook(() => useAuction(listing));
    emit("pusher:subscription_succeeded", {});
    emit("pusher:subscription_succeeded", {});
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    unmount();
    emit("pusher:subscription_succeeded", {});
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
});
