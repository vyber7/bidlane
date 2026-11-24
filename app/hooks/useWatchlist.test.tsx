// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistUpdateEvent } from "@/app/types/auction-events";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import useWatchlist from "./useWatchlist";

let realtime: FakeRealtime;
beforeEach(() => { vi.clearAllMocks(); realtime = installFakeRealtime(); mocks.post.mockResolvedValue({ data: { listingId: "one", watching: true } }); });
afterEach(() => { cleanup(); realtime.uninstall(); });

describe("private watchlist synchronization", () => {
  it("ignores other listings and accounts on the shared private user channel", () => {
    const { result } = renderHook(() => useWatchlist({ listingId: "one", userId: "buyer", initialWatching: false }));
    expect(realtime.subscribed("user:buyer")).toBe(true);
    const emit = (update: WatchlistUpdateEvent) => realtime.deliver("user:buyer", "watchlist-update", update);
    act(() => emit({ listingId: "two", userId: "buyer", watching: true }));
    expect(result.current.watching).toBe(false);
    act(() => emit({ listingId: "one", userId: "other", watching: true }));
    expect(result.current.watching).toBe(false);
    act(() => emit({ listingId: "one", userId: "buyer", watching: true }));
    expect(result.current.watching).toBe(true);
  });

  it("does not subscribe while signed out", () => {
    renderHook(() => useWatchlist({ listingId: "one", initialWatching: false }));
    expect(realtime.everSubscribed()).toBe(false);
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
