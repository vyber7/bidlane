"use client";

import { useSyncExternalStore } from "react";
import { formatAuctionCountdown } from "@/app/utils/format";

// Every mounted countdown reads the same clock, including the closing bar.
const listeners = new Set<() => void>();
let now: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      now = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => null;
const subscribeInactive = () => () => {};

export default function useCountDown(targetDate: Date | string | null) {
  const endTime = targetDate === null ? NaN : new Date(targetDate).getTime();
  const active = Number.isFinite(endTime);
  const currentTime = useSyncExternalStore(
    active ? subscribe : subscribeInactive,
    active ? getSnapshot : getServerSnapshot,
    getServerSnapshot
  );
  const remainingMs = currentTime !== null && Number.isFinite(endTime)
    ? Math.max(0, endTime - currentTime)
    : null;

  return {
    remainingMs,
    expired: remainingMs !== null && remainingMs === 0,
    timeLeft: remainingMs === null ? "" : formatAuctionCountdown(remainingMs),
  };
}
