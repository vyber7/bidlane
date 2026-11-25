"use client";

import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { logger } from "@/app/libs/logger";
import { getApiErrorMessage } from "@/app/utils/api-error";

// Automatic Finalization requests in flight, keyed by Listing and deadline.
// Every view of the same Closing Auction shares one request; once it settles
// it is forgotten, so a later view may ask again (the endpoint is idempotent).
const inFlight = new Map<string, Promise<boolean>>();

function requestFinalization(listingId: string, key: string) {
  let request = inFlight.get(key);
  if (!request) {
    request = axios
      .post("/api/auction-finalize", { listingId })
      .then(() => true, (error: unknown) => {
        logger.warn("auction.auto_finalize_client_failed", { listingId, error: String(error) });
        return false;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

/**
 * Asks for Finalization once per deadline while the Auction is Closing, and
 * offers a manual retry. `finalizing` is true while either is in flight for
 * the current deadline. `refresh` runs whenever a request settles.
 */
export default function useAuctionFinalization({ listingId, deadline, closing, refresh }: {
  listingId: string;
  deadline: Date | null;
  closing: boolean;
  refresh: () => void;
}) {
  const key = `${listingId}:${deadline?.toISOString() ?? ""}`;
  const requested = useRef<string | null>(null);
  const [autoPending, setAutoPending] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!closing || requested.current === key) return;
    requested.current = key;
    setAutoPending(key);
    void requestFinalization(listingId, key).then((finalized) => {
      // A failed request may be asked again for the same deadline; a request
      // for an older deadline must not clear the pending state of a newer one.
      if (!finalized && requested.current === key) requested.current = null;
      setAutoPending((current) => current === key ? null : current);
      refresh();
    });
  }, [closing, key, listingId, refresh]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await axios.post("/api/auction-finalize", { listingId });
      refresh();
    } catch (error) {
      logger.error("auction.finalize.client_failed", error, { listingId });
      toast.error(getApiErrorMessage(error, "The auction results could not be finalized. Please try again."));
    } finally {
      setRetrying(false);
    }
  }, [listingId, refresh]);

  return { finalizing: retrying || autoPending === key, retry };
}
