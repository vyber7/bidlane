"use client";

import axios from "axios";
import { useState } from "react";
import toast from "react-hot-toast";
import usePusherEvent from "./usePusherEvent";

interface WatchlistUpdate {
  listingId: string;
  userId: string;
  watching: boolean;
}

interface WatchlistResponse {
  listingId: string;
  watching: boolean;
}

export default function useWatchlist({
  listingId,
  userId,
  initialWatching,
}: {
  listingId: string;
  userId?: string | null;
  initialWatching: boolean;
}) {
  const [watching, setWatching] = useState(initialWatching);
  const [isUpdating, setIsUpdating] = useState(false);

  usePusherEvent<WatchlistUpdate>(
    userId ? `listing-${listingId}` : null,
    "watchlist-update",
    (update) => {
      if (update.userId === userId) setWatching(update.watching);
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
    setWatching(desired);
    setIsUpdating(true);

    try {
      const response = await axios.post<WatchlistResponse>(
        "/api/update-watchlist",
        { listingId, watching: desired }
      );
      setWatching(response.data.watching);
    } catch {
      setWatching(previous);
      toast.error("The watchlist could not be updated. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  return { watching, isUpdating, toggle };
}
