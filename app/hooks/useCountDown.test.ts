// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useCountDown from "./useCountDown";
import { auctionNow } from "@/app/test/auction-fixtures";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("auction countdown", () => {
  it("uses refreshed deadlines immediately, including after expiry", () => {
    const { result, rerender } = renderHook(({ end }) => useCountDown(end), {
      initialProps: { end: new Date(auctionNow.getTime() + 10000).toISOString() },
    });
    expect(result.current.remainingMs).toBe(10000);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.expired).toBe(true);

    rerender({ end: new Date(Date.now() + 120000).toISOString() });
    expect(result.current.remainingMs).toBe(120000);
    expect(result.current.expired).toBe(false);
    expect(result.current.timeLeft).toBe("2m : 0s");
  });

  it.each([null, "invalid"])("does not treat %s as an expired deadline", (end) => {
    const { result } = renderHook(() => useCountDown(end));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toEqual({ remainingMs: null, expired: false, timeLeft: "" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [5000, "5s"],
    [65000, "1m : 5s"],
    [3605000, "1h : 0m : 5s"],
    [86400000, "1d"],
    [691200000, "1w 1d 0h 0m 0s"],
  ])("preserves the display format for %i milliseconds", (remainingMs, label) => {
    const { result } = renderHook(() => useCountDown(new Date(auctionNow.getTime() + remainingMs)));
    expect(result.current.timeLeft).toBe(label);
  });

  it("expires at the deadline and clamps elapsed time to zero", () => {
    const { result } = renderHook(() => useCountDown(new Date(auctionNow.getTime() + 1000)));
    expect(result.current.expired).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toEqual({ remainingMs: 0, expired: true, timeLeft: "Ending..." });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remainingMs).toBe(0);
  });

  it("shares one clock and cleans up after the last consumer", () => {
    const end = new Date(auctionNow.getTime() + 60000);
    const first = renderHook(() => useCountDown(end));
    const second = renderHook(() => useCountDown(end.toISOString()));
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(first.result.current).toEqual(second.result.current);
    first.unmount();
    expect(vi.getTimerCount()).toBe(1);
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
