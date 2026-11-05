// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistUpdateEvent } from "@/app/types/auction-events";

const mocks = vi.hoisted(() => ({ post: vi.fn(), subscriptions: new Map<string, (data: WatchlistUpdateEvent) => void>() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
vi.mock("./usePusherEvent", () => ({ default: (channel: string | null, event: string, handler: (data: WatchlistUpdateEvent) => void) => {
  if (channel) mocks.subscriptions.set(`${channel}:${event}`, handler);
} }));
import useWatchlist from "./useWatchlist";

beforeEach(() => { vi.clearAllMocks(); mocks.subscriptions.clear(); mocks.post.mockResolvedValue({ data: { listingId: "one", watching: true } }); });
afterEach(cleanup);

describe("private watchlist synchronization", () => {
  it("ignores other listings and accounts on the shared private user channel", () => {
    const { result } = renderHook(() => useWatchlist({ listingId: "one", userId: "buyer", initialWatching: false }));
    expect([...mocks.subscriptions.keys()]).toEqual(["private-user-buyer:watchlist-update"]);
    const emit = mocks.subscriptions.get("private-user-buyer:watchlist-update")!;
    act(() => emit({ listingId: "two", userId: "buyer", watching: true }));
    expect(result.current.watching).toBe(false);
    act(() => emit({ listingId: "one", userId: "other", watching: true }));
    expect(result.current.watching).toBe(false);
    act(() => emit({ listingId: "one", userId: "buyer", watching: true }));
    expect(result.current.watching).toBe(true);
  });

  it("does not subscribe while signed out", () => {
    renderHook(() => useWatchlist({ listingId: "one", initialWatching: false }));
    expect(mocks.subscriptions.size).toBe(0);
  });

  it("adopts refreshed watch state and resets when the viewed listing changes", () => {
    const { result, rerender } = renderHook(useWatchlist, { initialProps: { listingId: "one", userId: "buyer", initialWatching: false } });
    rerender({ listingId: "one", userId: "buyer", initialWatching: true });
    expect(result.current.watching).toBe(true);
    rerender({ listingId: "two", userId: "buyer", initialWatching: false });
    expect(result.current.watching).toBe(false);
  });

  it("does not apply an earlier account's pending response to a new account", async () => {
    let resolve!: (value: { data: { watching: boolean } }) => void;
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(useWatchlist, { initialProps: { listingId: "one", userId: "first", initialWatching: false } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.toggle(); });
    expect(result.current.watching).toBe(true);
    rerender({ listingId: "one", userId: "second", initialWatching: false });
    expect(result.current.watching).toBe(false);
    await act(async () => { resolve({ data: { watching: true } }); await pending; });
    expect(result.current.watching).toBe(false);
    expect(result.current.isUpdating).toBe(false);
  });

  it("keeps the mutation lock when refreshed props arrive before the response", async () => {
    let resolve!: (value: { data: { watching: boolean } }) => void;
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(useWatchlist, { initialProps: { listingId: "one", userId: "buyer", initialWatching: false } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.toggle(); });
    rerender({ listingId: "one", userId: "buyer", initialWatching: true });
    expect(result.current.watching).toBe(true);
    expect(result.current.isUpdating).toBe(true);
    await act(async () => result.current.toggle());
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { watching: true } }); await pending; });
    mocks.post.mockResolvedValueOnce({ data: { watching: false } });
    await act(async () => result.current.toggle());
    expect(result.current.watching).toBe(false);
    expect(result.current.isUpdating).toBe(false);
  });

  it("restores the previous watch state when persistence fails", async () => {
    mocks.post.mockRejectedValueOnce(new Error("Network unavailable"));
    const { result } = renderHook(() => useWatchlist({ listingId: "one", userId: "buyer", initialWatching: false }));
    await act(async () => result.current.toggle());
    expect(result.current.watching).toBe(false);
    expect(result.current.isUpdating).toBe(false);
  });
});
