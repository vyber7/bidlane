import { ObjectId, type ClientSession, type Db } from "mongodb";

type VerificationDocument = { _id: ObjectId; email: string; tokenHash: string; requestedAt: Date; expiresAt: Date };
type Verification = Omit<VerificationDocument, "_id"> & { id: string };
function verification(document: VerificationDocument | null): Verification | null {
  if (!document) return null;
  if (typeof document.email !== "string" || typeof document.tokenHash !== "string" ||
    !(document.requestedAt instanceof Date) || !(document.expiresAt instanceof Date)) throw new Error("Invalid email verification record");
  return { id: document._id.toHexString(), email: document.email, tokenHash: document.tokenHash, requestedAt: document.requestedAt, expiresAt: document.expiresAt };
}
export function emailVerificationRepository(database: Db, session?: ClientSession) {
  const collection = database.collection<VerificationDocument>("EmailVerification");
  const options = { session };
  return {
    async find(id: string) { return verification(await collection.findOne({ _id: new ObjectId(id) }, options)); },
    async findByTokenHash(tokenHash: string) { return verification(await collection.findOne({ tokenHash }, options)); },
    replace(record: Verification) {
      const { id, ...data } = record;
      return collection.updateOne({ _id: new ObjectId(id) }, { $set: data }, { ...options, upsert: true });
    },
    async claim(record: Pick<Verification, "id" | "tokenHash">, now: Date) {
      const result = await collection.deleteOne({ _id: new ObjectId(record.id), tokenHash: record.tokenHash, expiresAt: { $gt: now } }, options);
      return { count: result.deletedCount };
    },
    async verifyUser(record: Pick<Verification, "id" | "email">, now: Date) {
      const result = await database.collection("User").updateOne({ _id: new ObjectId(record.id), email: record.email }, { $set: { emailVerified: now, updatedAt: now } }, options);
      return { count: result.matchedCount };
    },
  };
}
