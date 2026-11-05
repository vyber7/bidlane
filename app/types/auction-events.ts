import type { PublicListing } from "@/app/libs/listing-payload";
import type { BidWithAuthor, CommentWithAuthor } from ".";

export type BidEvent = Omit<BidWithAuthor, "createdAt"> & { createdAt: string };
export type CommentEvent = Omit<CommentWithAuthor, "createdAt"> & { createdAt: string };

export interface AuctionStartedEvent {
  auctionStartsAt: string;
  auctionEndsAt: string;
  startingBid: number;
  bidIncrement: number;
}

export interface AuctionEndedEvent {
  auctionEndsAt: string;
  result: "SOLD" | "RESERVE_NOT_MET";
}

export interface AuctionEndTimeEvent {
  newEndTime: string;
}

export interface AcceptedBidResponse {
  bid: BidEvent;
  currentBid: number;
  auctionEndsAt: string;
}

export interface CommentResponse {
  comment: CommentEvent;
}

export type ListingEvent = Omit<PublicListing,
  "createdAt" | "updatedAt" | "lastCommentAt" | "auctionStartsAt" | "auctionEndsAt"
> & {
  createdAt: string;
  updatedAt: string | null;
  lastCommentAt: string | null;
  auctionStartsAt: string | null;
  auctionEndsAt: string | null;
};

export interface WatchingUpdateEvent {
  listing: ListingEvent;
  watching: boolean;
}

export interface WatchlistResponse {
  listingId: string;
  watching: boolean;
}

export interface WatchlistUpdateEvent extends WatchlistResponse {
  userId: string;
}

export interface WatcherCountEvent {
  listingId: string;
  watcherCount: number;
}
