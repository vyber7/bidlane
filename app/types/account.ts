import type { TransactionCompletion } from "@/app/libs/transaction-completion";
import type { AuctionGroup } from "@/app/libs/listing-capabilities";
import type { PublicListing } from "@/app/libs/listing-codec";

export type AuctionBid = {
  id: string;
  year: number;
  make: string;
  model: string;
  location: string;
  coverImage: string | null;
  status: string;
  result: string | null;
  /** Where the Auction is filed, by Auction phase. */
  group: AuctionGroup;
  currentBid: number | null;
  auctionEndsAt: string | null;
  highestBid: number;
  lastBidAt: string;
  bidCount: number;
  isHighestBidder: boolean;
  completionHref: string | null;
  /** The Auction as loaded, which the dashboard follows through Real-time updates. */
  auction: PublicListing;
};

export type AccountNotification = {
  id: string;
  kind: "bid" | "auction" | "comment";
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  href: string;
  actionLabel: string;
  tone: "success" | "warning" | "neutral";
};

export type NotificationSummary = { userId: string; unreadCount: number };

export type NotificationFeed = {
  items: AccountNotification[];
  total: number;
  unreadCount: number;
  nextCursor: string | null;
};

export type ShipmentTransaction = {
  id: string;
  year: number;
  make: string;
  model: string;
  location: string;
  coverImage: string | null;
  price: number;
  soldAt: string;
  role: "buyer" | "seller";
  contactName: string;
  contactEmail: string | null;
  completion: TransactionCompletion | null;
};
