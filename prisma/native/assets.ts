import { Long, ObjectId, type ClientSession, type Db } from "mongodb";
import type { UploadKind } from "@/app/libs/upload-policy";

type AssetDocument = {
  _id: string; userId: ObjectId; kind: UploadKind; listingId: ObjectId | null;
  url: string; bytes: number | Long; format: string; createdAt: Date;
};
type AssetInput = {
  id: string; userId: string; kind: UploadKind; listingId: string | null;
  url: string; bytes: number; format: string;
};

export function assetRepository(database: Db, session?: ClientSession) {
  const collection = database.collection<AssetDocument>("UploadedAsset");
  return {
    register(input: AssetInput) {
      return collection.insertOne({
        _id: input.id, userId: new ObjectId(input.userId), kind: input.kind,
        listingId: input.listingId ? new ObjectId(input.listingId) : null,
        url: input.url, bytes: Long.fromNumber(input.bytes),
        format: input.format, createdAt: new Date(),
      }, { session });
    },
    findOwned(input: { userId: string; kind: UploadKind; urls: readonly string[]; listingId?: string }): Promise<{ url: string }[]> {
      // Prisma's explicit null filter excluded missing fields. Keep that rule
      // rather than granting ownership to malformed/partial registrations.
      const unbound = { listingId: { $eq: null, $exists: true } };
      return collection.find({
        userId: new ObjectId(input.userId), kind: input.kind, url: { $in: [...input.urls] },
        ...(input.listingId ? { $or: [unbound, { listingId: new ObjectId(input.listingId) }] } : unbound),
      }, { projection: { _id: 0, url: 1 }, session }).toArray();
    },
  };
}
