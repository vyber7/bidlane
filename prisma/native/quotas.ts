import {
  Long,
  MongoServerError,
  type ClientSession,
  type Collection,
} from "mongodb";

export type QuotaDocument = {
  _id: string;
  count: number | Long;
  expiresAt: Date;
};
const quotaResult = (bucket: QuotaDocument | null) =>
  bucket && {
    id: bucket._id,
    count: Long.isLong(bucket.count) ? bucket.count.toNumber() : bucket.count,
    expiresAt: bucket.expiresAt,
  };

export function quotaRepository(
  collection: Collection<QuotaDocument>,
  session?: ClientSession,
) {
  return {
    async read(id: string) {
      return quotaResult(await collection.findOne({ _id: id }, { session }));
    },
    async consume(id: string, expiresAt: Date) {
      // $inc initializes a missing count and preserves v6's BSON long storage.
      const increment = { $inc: { count: Long.ONE } };
      let bucket;
      try {
        bucket = await collection.findOneAndUpdate(
          { _id: id },
          { ...increment, $setOnInsert: { expiresAt } },
          {
            upsert: true,
            returnDocument: "after",
            includeResultMetadata: false,
            session,
          },
        );
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000)
          throw error;
        // Another first request may have inserted this exact _id. Do not reset
        // its expiry or retry unrelated storage errors as successful requests.
        bucket = await collection.findOneAndUpdate({ _id: id }, increment, {
          returnDocument: "after",
          includeResultMetadata: false,
          session,
        });
      }
      if (!bucket) throw new Error("Quota bucket was not updated");
      return quotaResult(bucket)!;
    },
    deleteExpired(now: Date) {
      return collection.deleteMany({ expiresAt: { $lte: now } }, { session });
    },
  };
}
