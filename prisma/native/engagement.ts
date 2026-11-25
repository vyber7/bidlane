import {
  Long,
  ObjectId,
  type ClientSession,
  type Db,
  type Document,
} from "mongodb";
import {
  decodeListing,
  listingProjection,
  publicListingFields,
  toPublicListing,
  type ListingField,
} from "@/app/libs/listing-codec";
import { publicListingFilter } from "@/app/libs/listing-review-rules";
import type { ReviewStatus } from "./listing-authoring";

type ListingDocument = {
  _id: ObjectId;
  userId: ObjectId;
  year: number | Long;
  make: string;
  model: string;
  status?: string | null;
  reviewStatus?: ReviewStatus | null;
  views?: number | Long | null;
  seenIds?: ObjectId[] | null;
  watchersIds?: ObjectId[] | null;
  lastCommentAt?: Date | null;
  updatedAt?: Date | null;
};
type UserDocument = {
  _id: ObjectId;
  name?: string | null;
  watchListIds?: ObjectId[] | null;
  seenListIds?: ObjectId[] | null;
  updatedAt?: Date;
};
const MAX_VIEW_COUNT = 2_147_483_647;
const engagementFields = [
  "userId",
  "status",
  "reviewStatus",
  "views",
  "year",
  "make",
  "model",
] as const satisfies readonly ListingField[];
const integer = (value: unknown): number => {
  const result = Long.isLong(value) ? value.toNumber() : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result))
    throw new Error("Invalid engagement integer");
  return result;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid engagement string");
  return value;
};
const nullableText = (value: unknown) => (value == null ? null : text(value));
const date = (value: unknown): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new Error("Invalid engagement date");
  return value;
};
// A watched Listing is decoded like any other and projected for its Watcher,
// so the Watchlist cannot drift from the public projection used elsewhere.
const watchedFields = [
  ...publicListingFields.filter((field) => field !== "id"),
  "reservePrice",
  "watchersIds",
  "reviewStatus",
] as const satisfies readonly ListingField[];
const watchedProjection = listingProjection(watchedFields);
const watched = (document: Document) => decodeListing(document, watchedFields);
function comment(document: Document) {
  return {
    id: (document._id as ObjectId).toHexString(),
    body: nullableText(document.body),
    image: nullableText(document.image),
    createdAt: date(document.createdAt),
    listingId: (document.listingId as ObjectId).toHexString(),
    user: document.author?.[0]
      ? { name: nullableText(document.author[0].name) }
      : null,
  };
}
export function engagementRepositories(database: Db, session?: ClientSession) {
  const listings = database.collection<ListingDocument>("Listing");
  const users = database.collection<UserDocument>("User");
  const comments = database.collection("Comment");
  const options = { session };
  return {
    comments: {
      async create(
        data: {
          listingId: string;
          userId: string;
          body: string;
          image?: string | null;
        },
        now: Date,
      ) {
        const userId = new ObjectId(data.userId);
        const author = await users.findOne(
          { _id: userId },
          { ...options, projection: { name: 1 } },
        );
        if (!author) throw new Error("Comment author not found");
        const document = {
          _id: new ObjectId(),
          listingId: new ObjectId(data.listingId),
          userId,
          body: data.body,
          image: data.image ?? null,
          createdAt: now,
        };
        await comments.insertOne(document, options);
        // This is a foreign-key relation; the unrelated commentsIds and
        // commenterIds arrays were never changed by Prisma's comments.connect.
        return comment({ ...document, author: [author] });
      },
      async list(listingId: string) {
        if (!ObjectId.isValid(listingId)) return [];
        return (
          await comments
            .aggregate(
              [
                { $match: { listingId: new ObjectId(listingId) } },
                { $sort: { createdAt: -1 } },
                {
                  $project: {
                    body: 1,
                    image: 1,
                    createdAt: 1,
                    listingId: 1,
                    userId: 1,
                  },
                },
                {
                  $lookup: {
                    from: "User",
                    localField: "userId",
                    foreignField: "_id",
                    pipeline: [{ $project: { _id: 0, name: 1 } }],
                    as: "author",
                  },
                },
              ],
              options,
            )
            .toArray()
        ).map(comment);
      },
    },
    engagement: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const document = await listings.findOne(
          { _id: new ObjectId(id) },
          { ...options, projection: listingProjection(engagementFields) },
        );
        return document ? decodeListing(document, engagementFields) : null;
      },
      async touchComment(id: string, now: Date) {
        const result = await listings.updateOne(
          { _id: new ObjectId(id), ...publicListingFilter.native() },
          { $set: { lastCommentAt: now, updatedAt: now } },
          options,
        );
        return { count: result.matchedCount };
      },
      async claimView(id: string, userId: string, now: Date) {
        const viewer = new ObjectId(userId);
        // Prisma's NOT array.has excludes a missing array but includes null.
        // Its push coalesces null to []; preserve that legacy distinction.
        const document = await listings.findOneAndUpdate(
          {
            _id: new ObjectId(id),
            views: { $exists: true },
            $or: [
              { views: { $lt: Long.fromNumber(MAX_VIEW_COUNT) } },
              { views: { $type: "null" } },
            ],
            seenIds: { $exists: true, $ne: viewer },
          },
          [
            {
              $set: {
                views: { $add: ["$views", Long.ONE] },
                seenIds: {
                  $concatArrays: [{ $ifNull: ["$seenIds", []] }, [viewer]],
                },
                updatedAt: now,
              },
            },
          ],
          { ...options, returnDocument: "after", projection: { views: 1 } },
        );
        // Prisma matches an explicit null counter, leaves it null on increment,
        // and returns the read default (1) + 1 for this first visit.
        return document
          ? document.views == null
            ? 2
            : integer(document.views)
          : null;
      },
      async recordSeen(userId: string, listingId: string, now: Date) {
        const listing = new ObjectId(listingId);
        await users.updateOne(
          {
            _id: new ObjectId(userId),
            seenListIds: { $exists: true, $ne: listing },
          },
          [
            {
              $set: {
                seenListIds: {
                  $concatArrays: [{ $ifNull: ["$seenListIds", []] }, [listing]],
                },
                updatedAt: now,
              },
            },
          ],
          options,
        );
      },
      async setWatch(id: string, userId: string, watching: boolean) {
        const listing = new ObjectId(id),
          user = new ObjectId(userId);
        // Relation-only connect/disconnect did not change either updatedAt.
        const result = await listings.updateOne(
          { _id: listing, ...publicListingFilter.native() },
          watching
            ? { $addToSet: { watchersIds: user } }
            : { $pull: { watchersIds: user } },
          options,
        );
        if (!result.matchedCount) return { count: 0 };
        const updated = await users.updateOne(
          { _id: user },
          watching
            ? { $addToSet: { watchListIds: listing } }
            : { $pull: { watchListIds: listing } },
          options,
        );
        if (!updated.matchedCount) throw new Error("Watcher not found");
        return { count: 1 };
      },
      async watchSnapshot(id: string, userId: string) {
        const document = await listings.findOne(
          { _id: new ObjectId(id) },
          { ...options, projection: watchedProjection },
        );
        if (!document) return null;
        const listing = watched(document);
        return {
          listing: toPublicListing(listing, userId),
          reviewStatus: listing.reviewStatus,
        };
      },
      async watchlist(userId: string) {
        const documents = await listings
          .find(
            {
              watchersIds: new ObjectId(userId),
              ...publicListingFilter.native(),
            },
            { ...options, projection: watchedProjection },
          )
          .sort({ updatedAt: -1 })
          .toArray();
        return documents.map((document) =>
          toPublicListing(watched(document), userId),
        );
      },
    },
  };
}
