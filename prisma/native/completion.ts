import { ObjectId, type ClientSession, type Db } from "mongodb";
import {
  completionFields,
  soldAuction,
  transactionAccess,
  transactionCompletion,
  type CompletionFields,
  type CompletionStep,
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
  status: 1,
  result: 1,
  ...Object.fromEntries(Object.values(completionFields).flatMap((roles) => Object.values(roles).map((field) => [field, 1]))),
};

export function completionRepository(database: Db, session?: ClientSession) {
  const listings = database.collection<CompletionDocument>("Listing");
  const participantFilter = (id: string, viewer: ObjectId) => ({
    _id: new ObjectId(id),
    ...soldAuction,
    highestBidderId: { $type: "objectId" as const },
    $expr: { $ne: ["$userId", "$highestBidderId"] },
    $or: [{ userId: viewer }, { highestBidderId: viewer }],
  });
  function completionRole(row: CompletionDocument, viewerId: string) {
    if (!(row.userId instanceof ObjectId) || !(row.highestBidderId instanceof ObjectId)) return null;
    const access = transactionAccess({
      status: row.status,
      result: row.result,
      userId: row.userId.toHexString(),
      highestBidderId: row.highestBidderId.toHexString(),
    }, viewerId);
    return access?.canComplete ? access.role : null;
  }

  function snapshot(row: CompletionDocument | null, viewerId: string) {
    if (!row) return null;
    const role = completionRole(row, viewerId);
    return role ? { role, completion: transactionCompletion(row) } : null;
  }

  return {
    async find(id: string, userId: string) {
      if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
      const viewer = new ObjectId(userId);
      const row = await listings.findOne(participantFilter(id, viewer), { session, projection });
      return snapshot(row, viewer.toHexString());
    },
    async confirm(id: string, userId: string, step: CompletionStep, completed: boolean, now: Date) {
      if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
      const viewer = new ObjectId(userId);
      const filter = participantFilter(id, viewer);
      const previous = await listings.findOne(filter, { session, projection });
      if (!previous) return null;
      const viewerId = viewer.toHexString();
      const role = completionRole(previous, viewerId);
      if (!role) return null;
      const field = completionFields[step][role];
      // Only this participant's field changes. The pipeline preserves the first
      // confirmation time on retries, and concurrent confirmations cannot clobber
      // one another. Recheck the sale and both participants in the atomic write.
      const row = await listings.findOneAndUpdate(
        { ...filter, userId: previous.userId, highestBidderId: previous.highestBidderId },
        [{ $set: { [field]: completed ? { $ifNull: [`$${field}`, now] } : null } }],
        { session, projection, returnDocument: "after" },
      );
      return snapshot(row, viewerId);
    },
  };
}
