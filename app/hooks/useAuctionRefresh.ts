"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface PendingRefresh {
  timer: ReturnType<typeof setTimeout>;
  requesters: Set<symbol>;
}

// Every card uses the same router. Subscription acknowledgements arrive in a
// burst, so recover missed events with one route refresh, not one per card.
const pendingRefreshes = new Map<() => void, PendingRefresh>();
const REFRESH_BATCH_MS = 250;

export default function useAuctionRefresh(listingId: string) {
  const { refresh } = useRouter();
  const requester = useRef(Symbol());

  useEffect(() => {
    const token = requester.current;
    return () => {
      const pending = pendingRefreshes.get(refresh);
      if (!pending) return;
      pending.requesters.delete(token);
      if (pending.requesters.size === 0) {
        clearTimeout(pending.timer);
        pendingRefreshes.delete(refresh);
      }
    };
  }, [refresh, listingId]);

  return useCallback(() => {
    const pending = pendingRefreshes.get(refresh);
    if (pending) {
      pending.requesters.add(requester.current);
      return;
    }

    pendingRefreshes.set(refresh, {
      requesters: new Set([requester.current]),
      timer: setTimeout(() => {
        pendingRefreshes.delete(refresh);
        refresh();
      }, REFRESH_BATCH_MS),
    });
  }, [refresh]);
}
