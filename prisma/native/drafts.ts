import { Long, ObjectId, type ClientSession, type Db } from "mongodb";
import type { DraftPayload } from "@/app/schemas/listing-draft";

type DraftDocument = {
  _id: ObjectId;
  userId: ObjectId;
  payload: unknown;
  revision?: Long | number | null;
  lastSaveKey: string;
  publishedListingId?: ObjectId | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
function draft(document: DraftDocument) {
  const revision =
    document.revision == null
      ? 1
      : Long.isLong(document.revision)
        ? document.revision.toNumber()
        : document.revision;
  if (
    !Number.isSafeInteger(revision) ||
    !(document.createdAt instanceof Date) ||
    !(document.updatedAt instanceof Date) ||
    typeof document.lastSaveKey !== "string" ||
    (document.deletedAt != null && !(document.deletedAt instanceof Date))
  )
    throw new Error("Invalid draft metadata");
  return {
    id: document._id.toHexString(),
    userId: document.userId.toHexString(),
    payload: document.payload,
    revision,
    lastSaveKey: document.lastSaveKey,
    publishedListingId: document.publishedListingId?.toHexString() ?? null,
    deletedAt: document.deletedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
export type DraftRecord = ReturnType<typeof draft>;
// Prisma's explicit null filter excludes absent fields. Do not broaden owner
// reads or compare-and-swap guards to include malformed historical markers.
const explicitNull = { $eq: null, $exists: true } as const;

export function draftRepository(database: Db, session?: ClientSession) {
  const collection = database.collection<DraftDocument>("ListingDraft");
  const options = { session };
  const ownedFilter = (id: string, userId: string) => ({
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    deletedAt: explicitNull,
  });
  const writable = (id: string, userId: string, revision: number) => ({
    ...ownedFilter(id, userId),
    revision: Long.fromNumber(revision),
    publishedListingId: explicitNull,
  });
  return {
    async find(id: string) {
      if (!ObjectId.isValid(id)) return null;
      const document = await collection.findOne(
        { _id: new ObjectId(id) },
        options,
      );
      return document ? draft(document) : null;
    },
    async owned(id: string, userId: string) {
      if (!ObjectId.isValid(id)) return null;
      const document = await collection.findOne(
        ownedFilter(id, userId),
        options,
      );
      return document ? draft(document) : null;
    },
    async list(userId: string) {
      return (
        await collection
          .find(
            {
              userId: new ObjectId(userId),
              deletedAt: explicitNull,
              publishedListingId: explicitNull,
            },
            options,
          )
          .sort({ updatedAt: -1 })
          .toArray()
      ).map(draft);
    },
    async create(
      data: {
        id: string;
        userId: string;
        payload: DraftPayload;
        lastSaveKey: string;
      },
      now: Date,
    ) {
      const userId = new ObjectId(data.userId);
      if (
        !(await database
          .collection("User")
          .findOne({ _id: userId }, { ...options, projection: { _id: 1 } }))
      )
        throw new Error("Draft owner not found");
      const document: DraftDocument = {
        _id: new ObjectId(data.id),
        userId,
        payload: data.payload,
        revision: Long.ONE,
        lastSaveKey: data.lastSaveKey,
        publishedListingId: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await collection.insertOne(document, options);
      return draft(document);
    },
    async save(
      id: string,
      userId: string,
      revision: number,
      data: { payload: DraftPayload; lastSaveKey: string },
      now: Date,
    ) {
      const updated = await collection.updateOne(
        writable(id, userId, revision),
        {
          $set: {
            payload: data.payload,
            lastSaveKey: data.lastSaveKey,
            updatedAt: now,
          },
          $inc: { revision: Long.ONE },
        },
        options,
      );
      return { count: updated.modifiedCount };
    },
    async remove(
      id: string,
      userId: string,
      revision: number,
      emptyPayload: DraftPayload,
      now: Date,
    ) {
      const updated = await collection.updateOne(
        writable(id, userId, revision),
        {
          $set: { deletedAt: now, updatedAt: now, payload: emptyPayload },
          $inc: { revision: Long.ONE },
        },
        options,
      );
      return { count: updated.modifiedCount };
    },
    async publish(
      id: string,
      userId: string,
      revision: number,
      listingId: string,
      now: Date,
    ) {
      const updated = await collection.updateOne(
        writable(id, userId, revision),
        {
          $set: { publishedListingId: new ObjectId(listingId), updatedAt: now },
        },
        options,
      );
      return { count: updated.modifiedCount };
    },
  };
}
