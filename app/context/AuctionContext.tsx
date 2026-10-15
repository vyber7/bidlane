"use client";

import type { Listing } from "@prisma/client";
import { createContext, useContext } from "react";
import useAuction from "@/app/hooks/useAuction";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";

const AuctionContext = createContext<ReturnType<typeof useAuction> | null>(null);

export function AuctionProvider({ listing, bids, comments, children }: {
  listing: Listing;
  bids: BidWithAuthor[];
  comments: CommentWithAuthor[];
  children?: React.ReactNode;
}) {
  const auction = useAuction(listing, bids, comments);
  return <AuctionContext.Provider value={auction}>{children}</AuctionContext.Provider>;
}

export function useAuctionContext() {
  const auction = useContext(AuctionContext);
  if (!auction) throw new Error("Auction components must be rendered inside AuctionProvider");
  return auction;
}
