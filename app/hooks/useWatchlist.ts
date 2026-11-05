"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import axios from "axios";
import { useState } from "react";
import toast from "react-hot-toast";
import usePusherEvent from "./usePusherEvent";
import type { WatchlistResponse, WatchlistUpdateEvent } from "@/app/types/auction-events";

export default function useWatchlist({
  listingId,
  userId,
  initialWatching,
}: {
  listingId: string;
  userId?: string | null;
  initialWatching: boolean;
}) {
  const [state, setState] = useState({ listingId, userId, initialWatching, watching: initialWatching, isUpdating: false });
  const sameIdentity = state.listingId === listingId && state.userId === userId;
  if (!sameIdentity || state.initialWatching !== initialWatching) {
    // A refreshed snapshot must not unlock a second mutation while the first
    // response can still arrive and replace it. Keep its optimistic state too.
    const isUpdating = sameIdentity && state.isUpdating;
    setState({ listingId, userId, initialWatching, watching: isUpdating ? state.watching : initialWatching, isUpdating });
  }
  const { watching, isUpdating } = state;
  // An older account/listing's in-flight response must not replace new state.
  const updateState = (patch: Partial<Pick<typeof state, "watching" | "isUpdating">>) => {
    setState((current) => current.listingId === listingId && current.userId === userId ? { ...current, ...patch } : current);
  };

  usePusherEvent<WatchlistUpdateEvent>(
    userId ? `private-user-${userId}` : null,
    "watchlist-update",
    (update) => {
      if (update.userId === userId && update.listingId === listingId) updateState({ watching: update.watching });
    }
  );

  const toggle = async () => {
    if (!userId) {
      toast.error("You need to be logged in!");
      return;
    }
    if (isUpdating) return;

    const previous = watching;
    const desired = !previous;
    updateState({ watching: desired, isUpdating: true });

    try {
      const response = await axios.post<WatchlistResponse>(
        "/api/update-watchlist",
        { listingId, watching: desired }
      );
      updateState({ watching: response.data.watching });
    } catch (error) {
      updateState({ watching: previous });
      toast.error(getApiErrorMessage(error, "The watchlist could not be updated. Please try again."));
    } finally {
      updateState({ isUpdating: false });
    }
  };

  return { watching, isUpdating, toggle };
}
