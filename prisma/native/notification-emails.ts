import { Long, ObjectId, type ClientSession, type Db, type Document, type Filter } from "mongodb";
import type { OutbidEmailPayload } from "@/app/libs/outbid-email";

type EmailStatus = "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED";
type EmailDocument = {
  _id: ObjectId; userId: ObjectId; eventKey: string; createdAt: Date; readAt?: Date | null;
  emailListingId?: ObjectId | null; emailStatus?: EmailStatus | null; emailAttempts?: number | Long | null;
  emailNextAttemptAt?: Date | null; emailLockedUntil?: Date | null; emailLockToken?: string | null;
  emailFirstAttemptAt?: Date | null; emailPayload?: OutbidEmailPayload | null;
};
export type NotificationEmailFinish = {
  emailStatus: EmailStatus; emailLastError: string | null; emailNextAttemptAt?: Date | null;
  emailSentAt?: Date; emailProviderId?: string;
};
const integer = (value: unknown): number => {
  const result = Long.isLong(value) ? value.toNumber() : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result)) throw new Error("Invalid notification email integer");
  return result;
};
const date = (value: unknown): Date | null => {
  if (value == null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid notification email date");
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid notification email string");
  return value;
};
const preference = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value !== "boolean") throw new Error("Invalid notification email preference");
  return value;
};
// Prisma's nullable-date lte matches explicit null, but excludes missing fields.
const eligible = (now: Date): Filter<EmailDocument> => ({ $or: [
  { emailStatus: "PENDING", $or: [{ emailNextAttemptAt: { $lte: now } }, { emailNextAttemptAt: { $type: "null" } }] },
  { emailStatus: "SENDING", $or: [{ emailLockedUntil: { $lte: now } }, { emailLockedUntil: { $type: "null" } }] },
] });
const lease = (id: string, token: string): Filter<EmailDocument> => ({ _id: new ObjectId(id), emailStatus: "SENDING", emailLockToken: token });

export function notificationEmailRepository(database: Db, session?: ClientSession) {
  const collection = database.collection<EmailDocument>("Notification");
  const options = { session };
  return {
    async candidates(now: Date, limit: number) {
      return (await collection.find(eligible(now), { ...options, projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray()).map((item) => ({ id: item._id.toHexString() }));
    },
    async claim(id: string, now: Date, token: string) {
      const result = await collection.updateOne({ _id: new ObjectId(id), ...eligible(now) }, [
        { $set: { emailStatus: "SENDING", emailLockToken: { $literal: token }, emailLockedUntil: new Date(now.getTime() + 120_000), emailAttempts: { $add: ["$emailAttempts", Long.ONE] } } },
      ], options);
      return { count: result.modifiedCount };
    },
    async find(id: string) {
      const [document] = await collection.aggregate([
        { $match: { _id: new ObjectId(id) } },
        { $project: { userId: 1, eventKey: 1, readAt: 1, emailListingId: 1, emailAttempts: 1, emailLockToken: 1, emailFirstAttemptAt: 1, emailPayload: 1 } },
        { $lookup: { from: "User", localField: "userId", foreignField: "_id", pipeline: [{ $project: { _id: 0, email: 1, outbidEmailsEnabled: 1, endingSoonEmailsEnabled: 1 } }], as: "recipient" } },
      ], options).toArray();
      if (!document) return null;
      const user = document.recipient[0];
      return {
        id: document._id.toHexString(), userId: document.userId.toHexString(), eventKey: text(document.eventKey), readAt: date(document.readAt),
        emailListingId: document.emailListingId?.toHexString() ?? null, emailAttempts: document.emailAttempts == null ? 0 : integer(document.emailAttempts),
        emailLockToken: document.emailLockToken == null ? null : text(document.emailLockToken), emailFirstAttemptAt: date(document.emailFirstAttemptAt),
        emailPayload: (document.emailPayload ?? null) as OutbidEmailPayload | null,
        user: user ? { email: user.email == null ? null : text(user.email), outbidEmailsEnabled: preference(user.outbidEmailsEnabled), endingSoonEmailsEnabled: preference(user.endingSoonEmailsEnabled) } : null,
      };
    },
    async prepare(id: string, token: string, payload: OutbidEmailPayload, now: Date) {
      const result = await collection.updateOne(lease(id, token), { $set: { emailPayload: payload, emailFirstAttemptAt: now } }, options);
      return { count: result.matchedCount };
    },
    async finish(id: string, token: string, data: NotificationEmailFinish) {
      const result = await collection.updateOne(lease(id, token), { $set: { ...data, emailLockToken: null, emailLockedUntil: null } }, options);
      return { count: result.modifiedCount };
    },
    async attempts(id: string) {
      const document = await collection.findOne({ _id: new ObjectId(id) }, { ...options, projection: { emailAttempts: 1 } });
      return document ? document.emailAttempts == null ? 0 : integer(document.emailAttempts) : null;
    },
    async listing(id: string) {
      const document: Document | null = await database.collection("Listing").findOne({ _id: new ObjectId(id) }, { ...options, projection: { year: 1, make: 1, model: 1, status: 1, auctionEndsAt: 1, highestBidderId: 1, watchersIds: 1, biddersIds: 1 } });
      return document ? {
        id: document._id.toHexString(), year: integer(document.year), make: text(document.make), model: text(document.model), status: document.status ?? "UPCOMING",
        auctionEndsAt: date(document.auctionEndsAt), highestBidderId: document.highestBidderId?.toHexString() ?? null,
        watchersIds: (document.watchersIds ?? []).map((value: ObjectId) => value.toHexString()) as string[],
        biddersIds: (document.biddersIds ?? []).map((value: ObjectId) => value.toHexString()) as string[],
      } : null;
    },
  };
}
