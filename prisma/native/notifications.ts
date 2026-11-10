import { Long, ObjectId, type ClientSession, type Db, type Document } from "mongodb";
import type { NotificationDraft } from "@/app/libs/notifications";
import type { AccountNotification } from "@/app/types/account";

export type NotificationReadScope = { ids: string[] } | { before: Date };
const unread = { readAt: { $eq: null, $exists: true } };
const date = (value: unknown): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid notification date");
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid notification string");
  return value;
};
function notification(document: Document): Omit<AccountNotification, "createdAt" | "readAt"> & { createdAt: Date; readAt: Date | null } {
  if (!["bid", "auction", "comment"].includes(document.kind) || !["success", "warning", "neutral"].includes(document.tone)) throw new Error("Invalid notification metadata");
  return {
    id: document._id.toHexString(), kind: document.kind, title: text(document.title), message: text(document.message),
    href: text(document.href), actionLabel: text(document.actionLabel), tone: document.tone,
    createdAt: date(document.createdAt), readAt: document.readAt == null ? null : date(document.readAt),
  };
}

export function notificationRepository(database: Db, session?: ClientSession) {
  const collection = database.collection("Notification");
  const options = { session };
  return {
    async anchor(userId: string, id: string) {
      if (!ObjectId.isValid(id)) return null;
      const document = await collection.findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) }, { ...options, projection: { createdAt: 1 } });
      return document ? { id: document._id.toHexString(), createdAt: date(document.createdAt) } : null;
    },
    async list(userId: string, unreadOnly: boolean, anchor: { id: string; createdAt: Date } | null) {
      const documents = await collection.find({
        userId: new ObjectId(userId), ...(unreadOnly && unread),
        ...(anchor && { $or: [{ createdAt: { $lt: anchor.createdAt } }, { createdAt: anchor.createdAt, _id: { $lt: new ObjectId(anchor.id) } }] }),
      }, { ...options, projection: { kind: 1, title: 1, message: 1, createdAt: 1, readAt: 1, href: 1, actionLabel: 1, tone: 1 } })
        .sort({ createdAt: -1, _id: -1 }).limit(51).toArray();
      return documents.map(notification);
    },
    count(userId: string) { return collection.countDocuments({ userId: new ObjectId(userId) }, options); },
    unreadCount(userId: string) { return collection.countDocuments({ userId: new ObjectId(userId), ...unread }, options); },
    async markRead(userId: string, scope: NotificationReadScope, now: Date) {
      const result = await collection.updateMany({
        userId: new ObjectId(userId), ...unread,
        ...("ids" in scope ? { _id: { $in: scope.ids.map((id) => new ObjectId(id)) } } : { createdAt: { $lte: scope.before } }),
      }, { $set: { readAt: now } }, options);
      return { count: result.modifiedCount };
    },
    async insertOnce(item: NotificationDraft) {
      const userId = new ObjectId(item.userId);
      await collection.updateOne({ userId, eventKey: item.eventKey }, { $setOnInsert: {
        _id: new ObjectId(), userId, eventKey: item.eventKey, kind: item.kind, title: item.title, message: item.message,
        href: item.href, actionLabel: item.actionLabel, tone: item.tone, createdAt: item.createdAt, readAt: null,
        emailListingId: item.emailListingId ? new ObjectId(item.emailListingId) : null,
        emailStatus: item.emailListingId ? "PENDING" : null, emailAttempts: Long.ZERO,
        emailNextAttemptAt: item.emailListingId ? new Date() : null,
        emailLockedUntil: null, emailLockToken: null, emailFirstAttemptAt: null, emailPayload: null,
        emailSentAt: null, emailProviderId: null, emailLastError: null,
      } }, { upsert: true, session });
    },
  };
}
