import type { Listing } from "@prisma/client";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";

export const auctionNow = new Date("2026-10-14T12:00:00.000Z");

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "abcdef0123456789abcdef01",
    userId: "seller",
    year: 2020,
    make: "Porsche",
    model: "911",
    miles: 10000,
    images: [],
    location: "New York",
    description: "Test vehicle",
    reservePrice: null,
    createdAt: auctionNow,
    updatedAt: auctionNow,
    lastCommentAt: null,
    views: 1,
    coverImage: null,
    auctionStartsAt: new Date(auctionNow.getTime() - 3600000),
    auctionEndsAt: new Date(auctionNow.getTime() + 60000),
    status: "LIVE",
    result: null,
    isFeatured: false,
    startingBid: 10000,
    currentBid: null,
    bidIncrement: 500,
    biddersIds: [],
    highestBidderId: null,
    seenIds: [],
    watchersIds: [],
    commentsIds: [],
    commenterIds: [],
    ...overrides,
  };
}

export function makeBid(overrides: Partial<BidWithAuthor> = {}): BidWithAuthor {
  return {
    id: "bid-1",
    listingId: makeListing().id,
    userId: "buyer",
    amount: 12000,
    createdAt: auctionNow.toISOString(),
    user: { name: "Buyer" },
    ...overrides,
  };
}

export function makeComment(overrides: Partial<CommentWithAuthor> = {}): CommentWithAuthor {
  return {
    id: "comment-1",
    listingId: makeListing().id,
    body: "Service history?",
    image: null,
    createdAt: auctionNow.toISOString(),
    user: { name: "Buyer" },
    ...overrides,
  };
}
