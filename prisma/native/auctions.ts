import { Long, ObjectId, type ClientSession, type Db } from "mongodb";
import type { AcceptedBidResponse } from "@/app/types/auction-events";

type AuctionDocument = {
  _id: ObjectId;
  userId: ObjectId;
  year: number | Long;
  make: string;
  model: string;
  status: string;
  result?: string | null;
  reviewStatus?: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | null;
  reviewRevision?: number | Long | null;
  auctionStartsAt?: Date | null;
  auctionEndsAt?: Date | null;
  startingBid?: number | Long | null;
  currentBid?: number | Long | null;
  bidIncrement?: number | Long | null;
  reservePrice?: number | Long | null;
  highestBidderId?: ObjectId | null;
  biddersIds?: ObjectId[];
  watchersIds?: ObjectId[];
  endingSoonReminderAt?: Date | null;
  updatedAt?: Date | null;
};
const projection = {
  userId: 1,
  year: 1,
  make: 1,
  model: 1,
  status: 1,
  result: 1,
  reviewStatus: 1,
  reviewRevision: 1,
  auctionStartsAt: 1,
  auctionEndsAt: 1,
  startingBid: 1,
  currentBid: 1,
  bidIncrement: 1,
  reservePrice: 1,
  highestBidderId: 1,
  biddersIds: 1,
  watchersIds: 1,
} as const;
function integer(value: number | Long): number {
  const result = Long.isLong(value) ? value.toNumber() : value;
  if (!Number.isSafeInteger(result)) throw new Error("Invalid auction integer");
  return result;
}
const nullableInteger = (value: number | Long | null | undefined) =>
  value == null ? null : integer(value);
function date(value: Date | null | undefined): Date | null {
  if (value == null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new Error("Invalid auction date");
  return value;
}
function text(value: string): string {
  if (typeof value !== "string") throw new Error("Invalid auction string");
  return value;
}
function auction(document: AuctionDocument) {
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    year: integer(document.year),
    make: text(document.make),
    model: text(document.model),
    status: text(document.status),
    result: document.result == null ? null : text(document.result),
    reviewStatus: document.reviewStatus ?? null,
    reviewRevision: nullableInteger(document.reviewRevision) ?? 0,
    auctionStartsAt: date(document.auctionStartsAt),
    auctionEndsAt: date(document.auctionEndsAt),
    startingBid: nullableInteger(document.startingBid),
    currentBid: nullableInteger(document.currentBid),
    bidIncrement: nullableInteger(document.bidIncrement),
    reservePrice: nullableInteger(document.reservePrice),
    highestBidderId: document.highestBidderId?.toHexString() ?? null,
    biddersIds: (document.biddersIds ?? []).map((id) => id.toHexString()),
    watchersIds: (document.watchersIds ?? []).map((id) => id.toHexString()),
  };
}
export type AuctionListing = ReturnType<typeof auction>;
type Submission = {
  _id: ObjectId;
  userId: ObjectId;
  key: string;
  listingId: ObjectId;
  amount: number | Long;
  response: AcceptedBidResponse;
  createdAt: Date;
};

export function auctionRepositories(database: Db, session?: ClientSession) {
  const listings = database.collection<AuctionDocument>("Listing");
  const users = database.collection<{
    _id: ObjectId;
    name?: string | null;
    BidOnListIds?: ObjectId[];
    updatedAt: Date;
  }>("User");
  const submissions = database.collection<Submission>("BidSubmission");
  const options = { session };
  const previousState = (listing: AuctionListing) => ({
    _id: new ObjectId(listing.id),
    status: "LIVE",
    auctionEndsAt: listing.auctionEndsAt,
    // A native null match includes missing fields, preserving the old OR filter.
    currentBid:
      listing.currentBid === null ? null : Long.fromNumber(listing.currentBid),
  });
  const reminderFilter = (now: Date, windowEnd: Date) => ({
    status: "LIVE",
    endingSoonReminderAt: null,
    auctionEndsAt: { $gt: now, $lte: windowEnd },
  });
  return {
    auctions: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const document = await listings.findOne(
          { _id: new ObjectId(id) },
          { ...options, projection },
        );
        return document ? auction(document) : null;
      },
      async start(
        listing: AuctionListing,
        data: {
          auctionStartsAt: Date;
          auctionEndsAt: Date;
          startingBid: number;
          bidIncrement: number;
        },
      ) {
        const result = await listings.updateOne(
          {
            _id: new ObjectId(listing.id),
            userId: new ObjectId(listing.userId),
            status: "UPCOMING",
            reviewStatus: "APPROVED",
            reviewRevision:
              listing.reviewRevision === 0
                ? { $in: [Long.ZERO, null] }
                : Long.fromNumber(listing.reviewRevision),
          },
          {
            $set: {
              ...data,
              startingBid: Long.fromNumber(data.startingBid),
              bidIncrement: Long.fromNumber(data.bidIncrement),
              status: "LIVE",
              updatedAt: data.auctionStartsAt,
            },
          },
          options,
        );
        return { count: result.modifiedCount };
      },
      async claimBid(
        listing: AuctionListing,
        data: { amount: number; userId: string; auctionEndsAt: Date },
        now: Date,
      ) {
        const result = await listings.updateOne(
          previousState(listing),
          {
            $set: {
              currentBid: Long.fromNumber(data.amount),
              highestBidderId: new ObjectId(data.userId),
              auctionEndsAt: data.auctionEndsAt,
              updatedAt: now,
            },
            $addToSet: { biddersIds: new ObjectId(data.userId) },
          },
          options,
        );
        return { count: result.modifiedCount };
      },
      async createBid(data: {
        amount: number;
        userId: string;
        listingId: string;
        createdAt: Date;
      }) {
        const userId = new ObjectId(data.userId),
          listingId = new ObjectId(data.listingId);
        const user = await users.findOne(
          { _id: userId },
          { ...options, projection: { name: 1 } },
        );
        if (!user) throw new Error("Bidder not found");
        const name = user.name == null ? null : text(user.name);
        const id = new ObjectId();
        await database
          .collection("Bid")
          .insertOne(
            {
              _id: id,
              amount: Long.fromNumber(data.amount),
              userId,
              listingId,
              createdAt: data.createdAt,
            },
            options,
          );
        // Both sides of the former list-backed connect live in this session:
        // Listing.biddersIds was updated by claimBid; User.BidOnListIds here.
        const result = await users.updateOne(
          { _id: userId },
          {
            $addToSet: { BidOnListIds: listingId },
            $set: { updatedAt: data.createdAt },
          },
          options,
        );
        if (!result.matchedCount) throw new Error("Bidder not found");
        return {
          id: id.toHexString(),
          amount: data.amount,
          userId: userId.toHexString(),
          listingId: listingId.toHexString(),
          createdAt: data.createdAt,
          user: { name },
        };
      },
      async finish(
        listing: AuctionListing,
        result: "SOLD" | "RESERVE_NOT_MET",
        now: Date,
      ) {
        const updated = await listings.updateOne(
          previousState(listing),
          { $set: { status: "ENDED", result, updatedAt: now } },
          options,
        );
        return { count: updated.modifiedCount };
      },
      async expired(now: Date, limit: number) {
        return (
          await listings
            .find(
              { status: "LIVE", auctionEndsAt: { $lte: now } },
              { ...options, projection },
            )
            .sort({ auctionEndsAt: 1 })
            .limit(limit)
            .toArray()
        ).map(auction);
      },
      async reminderCandidates(now: Date, windowEnd: Date, limit: number) {
        return (
          await listings
            .find(reminderFilter(now, windowEnd), {
              ...options,
              projection: { _id: 1 },
            })
            .sort({ auctionEndsAt: 1 })
            .limit(limit)
            .toArray()
        ).map((item) => ({ id: item._id.toHexString() }));
      },
      async claimReminder(id: string, now: Date, windowEnd: Date) {
        const document = await listings.findOneAndUpdate(
          { _id: new ObjectId(id), ...reminderFilter(now, windowEnd) },
          { $set: { endingSoonReminderAt: now, updatedAt: now } },
          { ...options, returnDocument: "after", projection },
        );
        return document ? auction(document) : null;
      },
    },
    bidSubmissions: {
      async find(userId: string, key: string) {
        const document = await submissions.findOne(
          { userId: new ObjectId(userId), key },
          { ...options, projection: { listingId: 1, amount: 1, response: 1 } },
        );
        return document
          ? {
              listingId: document.listingId.toHexString(),
              amount: integer(document.amount),
              response: document.response,
            }
          : null;
      },
      async create(
        data: {
          userId: string;
          key: string;
          listingId: string;
          amount: number;
          response: AcceptedBidResponse;
        },
        now: Date,
      ) {
        await submissions.insertOne(
          {
            _id: new ObjectId(),
            userId: new ObjectId(data.userId),
            key: data.key,
            listingId: new ObjectId(data.listingId),
            amount: Long.fromNumber(data.amount),
            response: data.response,
            createdAt: now,
          },
          options,
        );
      },
    },
  };
}
