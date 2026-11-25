import {
  Long,
  ObjectId,
  type ClientSession,
  type Db,
  type Document,
} from "mongodb";
import type { ValidatedListing } from "@/app/schemas/listing";
import type { z } from "zod";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";

export type ReviewStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
type Decision = z.output<typeof listingDecisionSchema>;
const integer = (value: unknown): number => {
  const result = Long.isLong(value) ? value.toNumber() : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result))
    throw new Error("Invalid listing integer");
  return result;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid listing string");
  return value;
};
const nullableText = (value: unknown) => (value == null ? null : text(value));
const date = (value: unknown): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new Error("Invalid listing date");
  return value;
};
const reviewStatus = (value: unknown): ReviewStatus | null => {
  if (value == null) return null;
  if (
    value !== "PENDING" &&
    value !== "APPROVED" &&
    value !== "CHANGES_REQUESTED"
  )
    throw new Error("Invalid listing review status");
  return value;
};
const projection = {
  userId: 1,
  year: 1,
  make: 1,
  model: 1,
  miles: 1,
  location: 1,
  description: 1,
  images: 1,
  coverImage: 1,
  transmission: 1,
  drivetrain: 1,
  titleStatus: 1,
  serviceHistory: 1,
  modifications: 1,
  knownFlaws: 1,
  vin: 1,
  vehicleRecords: 1,
  reservePrice: 1,
  createdAt: 1,
  status: 1,
  reviewStatus: 1,
  reviewRevision: 1,
  reviewNote: 1,
} as const;
function listing(document: Document) {
  return {
    id: (document._id as ObjectId).toHexString(),
    userId: (document.userId as ObjectId).toHexString(),
    year: integer(document.year),
    make: text(document.make),
    model: text(document.model),
    miles: integer(document.miles),
    location: text(document.location),
    description: text(document.description),
    images: (document.images ?? []).map(text) as string[],
    coverImage: nullableText(document.coverImage),
    vin: nullableText(document.vin),
    vehicleRecords: (document.vehicleRecords ?? null) as unknown,
    transmission: nullableText(document.transmission),
    drivetrain: nullableText(document.drivetrain),
    titleStatus: nullableText(document.titleStatus),
    serviceHistory: nullableText(document.serviceHistory),
    modifications: nullableText(document.modifications),
    knownFlaws: nullableText(document.knownFlaws),
    reservePrice:
      document.reservePrice == null ? null : integer(document.reservePrice),
    createdAt: date(document.createdAt),
    status: text(document.status),
    reviewStatus: reviewStatus(document.reviewStatus),
    reviewRevision:
      document.reviewRevision == null ? 0 : integer(document.reviewRevision),
    reviewNote: nullableText(document.reviewNote),
  };
}
/** A Listing as its seller and administrators load it. */
export type AuthoredListing = ReturnType<typeof listing>;
const revisionFilter = (revision: number) =>
  revision === 0 ? { $in: [Long.ZERO, null] } : Long.fromNumber(revision);

/** Fields a Correction may change, plus the Review state it leaves behind. */
export type CorrectedListing = Partial<
  Omit<ValidatedListing, "vin" | "images"> & {
    vin: string | null;
    images: readonly string[];
    coverImage: string;
  }
> & {
  reviewStatus: "PENDING";
  reviewNote: null;
  reviewRevision: number;
};

export function listingAuthoringRepository(
  database: Db,
  session?: ClientSession,
) {
  const collection = database.collection<Document & { images: string[] }>(
    "Listing",
  );
  const users = database.collection("User");
  const reviews = database.collection("ListingReview");
  const options = { session };
  const editFilter = (id: string, userId: string, revision: number) => ({
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    status: "UPCOMING",
    reviewRevision: revisionFilter(revision),
  });
  const find = async (id: string) => {
    if (!ObjectId.isValid(id)) return null;
    const document = await collection.findOne(
      { _id: new ObjectId(id) },
      { ...options, projection },
    );
    return document ? listing(document) : null;
  };
  return {
    find,
    async ownedListing(id: string, userId: string) {
      const document = await collection.findOne(
        { _id: new ObjectId(id), userId: new ObjectId(userId) },
        { ...options, projection: { _id: 1 } },
      );
      return document ? { id: document._id.toHexString() } : null;
    },
    async create(userId: string, data: ValidatedListing, now: Date) {
      const owner = new ObjectId(userId);
      if (
        !(await users.findOne(
          { _id: owner },
          { ...options, projection: { _id: 1 } },
        ))
      )
        throw new Error("Listing owner not found");
      const id = new ObjectId();
      // Only validated seller fields may enter the document; all server-owned
      // state and formerly implicit Prisma defaults are supplied explicitly.
      await collection.insertOne(
        {
          _id: id,
          userId: owner,
          year: Long.fromNumber(data.year),
          make: data.make,
          model: data.model,
          miles: Long.fromNumber(data.miles),
          location: data.location,
          description: data.description,
          images: [...data.images],
          coverImage: data.images[0] ?? null,
          transmission: data.transmission,
          drivetrain: data.drivetrain,
          titleStatus: data.titleStatus,
          serviceHistory: data.serviceHistory,
          modifications: data.modifications,
          knownFlaws: data.knownFlaws,
          vin: data.vin ?? null,
          vehicleRecords: data.vehicleRecords ?? null,
          reservePrice:
            data.reservePrice == null
              ? null
              : Long.fromNumber(data.reservePrice),
          createdAt: now,
          updatedAt: now,
          lastCommentAt: now,
          views: Long.ONE,
          status: "UPCOMING",
          result: null,
          reviewStatus: "PENDING",
          reviewRevision: Long.ZERO,
          reviewNote: null,
          isFeatured: false,
          auctionStartsAt: null,
          auctionEndsAt: null,
          endingSoonReminderAt: null,
          startingBid: null,
          currentBid: null,
          bidIncrement: null,
          highestBidderId: null,
          biddersIds: [],
          seenIds: [],
          watchersIds: [],
          commentsIds: [],
          commenterIds: [],
        },
        options,
      );
      return { id: id.toHexString() };
    },
    async reviewQueue(page: number, filter: ReviewStatus) {
      const documents = await collection
        .aggregate(
          [
            {
              $match: {
                status: "UPCOMING",
                reviewStatus:
                  filter === "PENDING" ? { $in: ["PENDING", null] } : filter,
              },
            },
            { $sort: { createdAt: 1, _id: 1 } },
            { $skip: (page - 1) * 20 },
            { $limit: 21 },
            {
              $project: {
                year: 1,
                make: 1,
                model: 1,
                createdAt: 1,
                reviewStatus: 1,
                reviewNote: 1,
                userId: 1,
              },
            },
            {
              $lookup: {
                from: "User",
                localField: "userId",
                foreignField: "_id",
                pipeline: [{ $project: { _id: 0, name: 1 } }],
                as: "seller",
              },
            },
          ],
          options,
        )
        .toArray();
      return documents.map((item) => {
        if (!item.seller[0]) throw new Error("Listing owner not found");
        return {
          id: item._id.toHexString(),
          year: integer(item.year),
          make: text(item.make),
          model: text(item.model),
          createdAt: date(item.createdAt),
          reviewStatus: reviewStatus(item.reviewStatus),
          reviewNote: nullableText(item.reviewNote),
          user: { name: nullableText(item.seller[0].name) },
        };
      });
    },
    async reviewDetail(id: string) {
      const record = await find(id);
      if (!record) return null;
      const user = await users.findOne(
        { _id: new ObjectId(record.userId) },
        { ...options, projection: { name: 1, email: 1 } },
      );
      if (!user) throw new Error("Listing owner not found");
      const history = await reviews
        .find({ listingId: new ObjectId(id) }, options)
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      return {
        ...record,
        user: {
          name: nullableText(user.name),
          email: nullableText(user.email),
        },
        reviews: history.map((item) => {
          const decision = reviewStatus(item.decision);
          if (!decision) throw new Error("Invalid review decision");
          return {
            id: item._id.toHexString(),
            listingId: item.listingId.toHexString(),
            reviewerId: item.reviewerId.toHexString(),
            reviewerName: text(item.reviewerName),
            decision,
            reason: nullableText(item.reason),
            revision: integer(item.revision),
            createdAt: date(item.createdAt),
          };
        }),
      };
    },
    async setReview(id: string, input: Decision, now: Date) {
      const updated = await collection.updateOne(
        {
          _id: new ObjectId(id),
          status: "UPCOMING",
          reviewRevision: revisionFilter(input.revision),
        },
        {
          $set: {
            reviewStatus: input.decision,
            reviewNote: input.reason || null,
            reviewRevision: Long.fromNumber(input.revision + 1),
            updatedAt: now,
          },
        },
        options,
      );
      return { count: updated.modifiedCount };
    },
    async addReview(
      id: string,
      input: Decision,
      admin: { id: string; name: string | null },
      now: Date,
    ) {
      await reviews.insertOne(
        {
          _id: new ObjectId(),
          listingId: new ObjectId(id),
          reviewerId: new ObjectId(admin.id),
          reviewerName: admin.name || "Admin",
          decision: input.decision,
          reason: input.reason || null,
          revision: Long.fromNumber(input.revision + 1),
          createdAt: now,
        },
        options,
      );
    },
    /**
     * The one guarded save for a Correction: it writes only when the seller's
     * Listing is still Upcoming at the revision the Correction was checked against.
     */
    async saveCorrection(
      id: string,
      userId: string,
      revision: number,
      changes: CorrectedListing,
      now: Date,
    ) {
      const {
        year,
        miles,
        reservePrice,
        reviewRevision,
        images,
        ...storedAsIs
      } = changes;
      const updated = await collection.updateOne(
        editFilter(id, userId, revision),
        {
          $set: {
            // Fields a Correction leaves out are kept, never written as null.
            ...Object.fromEntries(
              Object.entries(storedAsIs).filter(
                ([, value]) => value !== undefined,
              ),
            ),
            ...(year !== undefined && { year: Long.fromNumber(year) }),
            ...(miles !== undefined && { miles: Long.fromNumber(miles) }),
            ...(reservePrice !== undefined && {
              reservePrice:
                reservePrice == null ? null : Long.fromNumber(reservePrice),
            }),
            ...(images !== undefined && { images: [...images] }),
            reviewRevision: Long.fromNumber(reviewRevision),
            updatedAt: now,
          },
        },
        options,
      );
      return { count: updated.modifiedCount };
    },
  };
}
