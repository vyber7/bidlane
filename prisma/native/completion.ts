import { ObjectId, type ClientSession, type Db } from "mongodb";
import {
  completionFields,
  transactionCompletion,
  type CompletionFields,
  type CompletionStep,
  type TransactionRole,
} from "@/app/libs/transaction-completion";

type CompletionDocument = CompletionFields & {
  _id: ObjectId;
  userId: ObjectId;
  highestBidderId: ObjectId;
  status: string;
  result: string;
};
const projection = {
  userId: 1,
  highestBidderId: 1,
  ...Object.fromEntries(Object.values(completionFields).flatMap((roles) => Object.values(roles).map((field) => [field, 1]))),
};

export function completionRepository(database: Db, session?: ClientSession) {
  const listings = database.collection<CompletionDocument>("Listing");
  const participantFilter = (id: string, userId: string) => ({
    _id: new ObjectId(id),
    status: "ENDED",
    result: "SOLD",
    highestBidderId: { $type: "objectId" as const },
    $expr: { $ne: ["$userId", "$highestBidderId"] },
    $or: [{ userId: new ObjectId(userId) }, { highestBidderId: new ObjectId(userId) }],
  });
  const snapshot = (row: CompletionDocument, userId: string) => ({
    role: (row.userId.equals(userId) ? "seller" : "buyer") as TransactionRole,
    completion: transactionCompletion(row),
  });

  return {
    async find(id: string, userId: string) {
      if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
      const row = await listings.findOne(participantFilter(id, userId), { session, projection });
      return row ? snapshot(row, userId) : null;
    },
    async confirm(id: string, userId: string, step: CompletionStep, completed: boolean, now: Date) {
      if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
      const filter = participantFilter(id, userId);
      const previous = await listings.findOne(filter, { session, projection });
      if (!previous) return null;
      const role = snapshot(previous, userId).role;
      const field = completionFields[step][role];
      // Only this participant's field changes. The pipeline preserves the first
      // confirmation time on retries, and concurrent confirmations cannot clobber
      // one another. Recheck the sale and both participants in the atomic write.
      const row = await listings.findOneAndUpdate(
        { ...filter, userId: previous.userId, highestBidderId: previous.highestBidderId },
        [{ $set: { [field]: completed ? { $ifNull: [`$${field}`, now] } : null } }],
        { session, projection, returnDocument: "after" },
      );
      return row ? snapshot(row, userId) : null;
    },
  };
}
