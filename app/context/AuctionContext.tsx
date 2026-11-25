"use client";

import type { PublicListing } from "@/app/libs/listing-codec";
import axios from "axios";
import { createContext, useContext, useEffect } from "react";
import useAuction from "@/app/hooks/useAuction";
import { logger } from "@/app/libs/logger";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";

const AuctionContext = createContext<ReturnType<typeof useAuction> | null>(null);

/**
 * The listing page's auction view, shared by every component on the page.
 * Unlike a card, it records a view of the Listing.
 */
export function AuctionProvider({ listing, viewerId, bids, comments, children }: {
  listing: PublicListing;
  viewerId?: string | null;
  bids: BidWithAuthor[];
  comments: CommentWithAuthor[];
  children?: React.ReactNode;
}) {
  const auction = useAuction(listing, { viewerId, bids, comments });

  useEffect(() => {
    axios
      .post("/api/listing-view", { listingId: listing.id })
      .catch((error: unknown) => {
        logger.warn("listing.view.client_failed", { listingId: listing.id, error: String(error) });
      });
  }, [listing.id, viewerId]);

  return <AuctionContext.Provider value={auction}>{children}</AuctionContext.Provider>;
}

export function useAuctionView() {
  const auction = useContext(AuctionContext);
  if (!auction) throw new Error("Auction components must be rendered inside AuctionProvider");
  return auction;
}
