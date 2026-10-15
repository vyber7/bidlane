export type AuctionBid = {
  id: string;
  year: number;
  make: string;
  model: string;
  location: string;
  coverImage: string | null;
  status: string;
  result: string | null;
  currentBid: number | null;
  auctionEndsAt: string | null;
  highestBid: number;
  lastBidAt: string;
  bidCount: number;
  isHighestBidder: boolean;
};

export type AccountNotification = {
  id: string;
  kind: "bid" | "auction" | "comment";
  title: string;
  message: string;
  createdAt: string;
  href: string;
  actionLabel: string;
  tone: "success" | "warning" | "neutral";
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
};
