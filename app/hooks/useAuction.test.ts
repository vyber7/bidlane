// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";
import { auctionNow, makeBid, makeComment, makePublicListing as makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), post: vi.fn(), toastError: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({ toast: { error: mocks.toastError } }));

import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import type { RealtimeCatalog } from "@/app/libs/realtime/catalog";
import useAuction from "./useAuction";
import { describeAuction } from "@/app/libs/auction-display";

let realtime: FakeRealtime;

function emit<E extends keyof RealtimeCatalog["listing"]>(event: E, payload: RealtimeCatalog["listing"][E], listingId = makeListing().id) {
  act(() => realtime.deliver(`listing:${listingId}`, event, payload));
}

function ready(listingId = makeListing().id) {
  act(() => realtime.ready(`listing:${listingId}`));
}


beforeEach(() => {
  realtime = installFakeRealtime();
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  realtime.uninstall();
  vi.useRealTimers();
});

describe("auction state reconciliation", () => {
  it("updates aggregate watcher counts without receiving watcher identities", () => {
    const listing = makeListing();
    const { result } = renderHook(() => useAuction(listing));
    emit("watcher-count-update", { listingId: makeListing().id, watcherCount: 7 });
    expect(result.current.listing.watcherCount).toBe(7);
    expect(result.current.listing).not.toHaveProperty("watchersIds");
    emit("watcher-count-update", { listingId: "other-listing", watcherCount: 99 });
    expect(result.current.listing.watcherCount).toBe(7);
  });

  it("recovers bids, activity, and an extension from refreshed props after missed events", () => {
    const { result, rerender } = renderHook((props) => useAuction(props.listing, { bids: props.bids, comments: props.comments }), {
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
    const { result, rerender } = renderHook((props) => useAuction(props.listing, { bids: props.bids }), {
      initialProps: { listing, bids: [] as BidWithAuthor[] },
    });
    const bid = makeBid();
    act(() => result.current.acceptBid({ bid, currentBid: bid.amount, auctionEndsAt: new Date(Date.now() + 120000).toISOString() }));
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
    act(() => vi.advanceTimersByTime(250));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("merges HTTP, live, and refreshed comments without losing or duplicating activity", () => {
    const listing = makeListing();
    const bids: BidWithAuthor[] = [];
    const { result, rerender } = renderHook((props) => useAuction(props.listing, { bids, comments: props.comments }), {
      initialProps: { listing, comments: [] as CommentWithAuthor[] },
    });
    const comment = makeComment();
    act(() => result.current.acceptComment(comment));
    emit("new-comment", comment);
    rerender({ listing: { ...listing }, comments: [comment, makeComment({ id: "missed-comment" })] });
    expect(result.current.comments).toHaveLength(2);
  });

  it("shows comments delivered in real time, but only on views that show activity", () => {
    const listing = makeListing();
    const card = renderHook(() => useAuction(listing));
    const bids: BidWithAuthor[] = [];
    const comments: CommentWithAuthor[] = [];
    const page = renderHook(() => useAuction(listing, { bids, comments }));
    emit("new-comment", { ...makeComment({ id: "realtime-comment" }), createdAt: auctionNow.toISOString() });
    expect(page.result.current.comments.map((comment) => comment.id)).toEqual(["realtime-comment"]);
    expect(card.result.current.comments).toEqual([]);
  });

  it("refreshes when subscribing and reconnecting, and releases listeners on unmount", () => {
    const listing = makeListing();
    const { unmount } = renderHook(() => useAuction(listing));
    ready();
    act(() => vi.advanceTimersByTime(250));
    ready();
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    unmount();
    ready();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("batches a full home page of subscription acknowledgements into one refresh", () => {
    const cards = Array.from({ length: 100 }, (_, index) => {
      const listing = makeListing({ id: `listing-${index}`, status: "UPCOMING", auctionEndsAt: null });
      return renderHook(() => useAuction(listing));
    });
    for (let index = 0; index < cards.length; index++) {
      ready(`listing-${index}`);
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    // A later reconnect still resynchronizes, once for the whole page.
    for (let index = 0; index < cards.length; index++) {
      ready(`listing-${index}`);
    }
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("cancels queued home refreshes when navigating away", () => {
    const first = makeListing({ id: "first", status: "UPCOMING" });
    const second = makeListing({ id: "second", status: "UPCOMING" });
    const cards = [first, second].map((listing) => renderHook(() => useAuction(listing)));
    ready(first.id);
    ready(second.id);
    cards[0].unmount();
    expect(vi.getTimerCount()).toBe(1);
    cards[1].unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the auction view for a viewer", () => {
  it.each([["seller"], ["buyer"], [null]])("describes the Auction to viewer %s as the display module does", (viewerId) => {
    const listing = makeListing();
    const { result } = renderHook(() => useAuction(listing, { viewerId }));
    expect(result.current.viewerId).toBe(viewerId);
    expect(result.current.display).toEqual(describeAuction(listing, result.current.phase, viewerId));
  });

  it("moves the display to Closing when the deadline passes", () => {
    const listing = makeListing();
    const { result } = renderHook(() => useAuction(listing, { viewerId: "buyer" }));
    expect(result.current.display.headline).toBe("Live auction");
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.display.timer).toBe("closing");
  });
});

describe("Finalization", () => {
  const finalizeCalls = () => mocks.post.mock.calls.filter(([url]) => url === "/api/auction-finalize");

  it.each([["seller"], ["buyer"], [null]])("requests Finalization on expiry for viewer %s and refreshes once it settles", async (viewerId) => {
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const { result } = renderHook(() => useAuction(listing, { viewerId }));
    expect(finalizeCalls()).toEqual([["/api/auction-finalize", { listingId: makeListing().id }]]);
    expect(result.current.finalization.finalizing).toBe(true);
    await act(async () => {});
    expect(result.current.finalization.finalizing).toBe(false);
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("never requests Finalization before the deadline or for an ended Auction", () => {
    const listings = [
      makeListing(),
      makeListing({ id: "ended", status: "ENDED", result: "SOLD", auctionEndsAt: auctionNow }),
      makeListing({ id: "upcoming", status: "UPCOMING" }),
    ];
    for (const listing of listings) renderHook(() => useAuction(listing));
    expect(finalizeCalls()).toHaveLength(0);
  });

  it("sends one request for every view of the same Closing Auction", async () => {
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const views = [renderHook(() => useAuction(listing, { viewerId: "buyer" })), renderHook(() => useAuction(listing))];
    expect(finalizeCalls()).toHaveLength(1);
    expect(views.map((view) => view.result.current.finalization.finalizing)).toEqual([true, true]);
    await act(async () => {});
    expect(views.map((view) => view.result.current.finalization.finalizing)).toEqual([false, false]);
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("requests an extended deadline again even after the previous deadline was requested", async () => {
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const { rerender } = renderHook(({ listing }) => useAuction(listing), { initialProps: { listing } });
    await act(async () => {});
    mocks.post.mockClear();
    rerender({ listing: { ...listing, auctionEndsAt: new Date(Date.now() + 1000) } });
    expect(finalizeCalls()).toHaveLength(0);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(finalizeCalls()).toHaveLength(1);
  });

  it("keeps a newer deadline's request in flight when an older request finishes late", async () => {
    const finish: Array<(value: unknown) => void> = [];
    mocks.post.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const { result, rerender } = renderHook(({ listing }) => useAuction(listing), { initialProps: { listing } });
    rerender({ listing: { ...listing, auctionEndsAt: new Date(Date.now() + 1000) } });
    await act(async () => vi.advanceTimersByTime(1000));
    expect(finish).toHaveLength(2);

    await act(async () => finish[0]({ data: {} }));
    expect(result.current.finalization.finalizing).toBe(true);
    await act(async () => finish[1]({ data: {} }));
    expect(result.current.finalization.finalizing).toBe(false);
  });

  it("asks again for the same deadline after a failed request when a new view mounts", async () => {
    mocks.post.mockRejectedValueOnce(new Error("offline"));
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const first = renderHook(() => useAuction(listing));
    await act(async () => {});
    expect(first.result.current.finalization.finalizing).toBe(false);
    act(() => vi.advanceTimersByTime(250));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    renderHook(() => useAuction(listing));
    expect(finalizeCalls()).toHaveLength(2);
  });

  it("retries on request, reporting it in flight, and shows why a retry failed", async () => {
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const { result } = renderHook(() => useAuction(listing, { viewerId: "seller" }));
    await act(async () => {});
    mocks.post.mockClear();

    let settle!: (value: unknown) => void;
    mocks.post.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    let retry!: Promise<void>;
    act(() => { retry = result.current.finalization.retry(); });
    expect(finalizeCalls()).toHaveLength(1);
    expect(result.current.finalization.finalizing).toBe(true);
    await act(async () => { settle({ data: {} }); await retry; });
    expect(result.current.finalization.finalizing).toBe(false);

    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: { error: "Try later" } } });
    await act(async () => result.current.finalization.retry());
    expect(mocks.toastError).toHaveBeenCalledWith("Try later");
  });
});
