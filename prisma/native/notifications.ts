import { Long, ObjectId, type ClientSession, type Db } from "mongodb";
import type { NotificationDraft } from "@/app/libs/notifications";

export function notificationRepository(database: Db, session?: ClientSession) {
  return {
    async insertOnce(item: NotificationDraft) {
      const userId = new ObjectId(item.userId);
      await database.collection("Notification").updateOne({ userId, eventKey: item.eventKey }, { $setOnInsert: {
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
