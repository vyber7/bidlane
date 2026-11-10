import { getNativeRepositories } from "@/app/libs/native-repositories";
import type { NotificationFeed } from "@/app/types/account";
import { ApiRequestError } from "@/app/libs/api-request";

export async function getNotificationFeed(userId: string, { cursor, unreadOnly = false }: { cursor?: string; unreadOnly?: boolean } = {}): Promise<NotificationFeed> {
  const { notifications } = getNativeRepositories();
  const anchor = cursor ? await notifications.anchor(userId, cursor) : null;
  if (cursor && !anchor) {
    throw new ApiRequestError(400, "Invalid notification cursor");
  }
  const [items, total, unreadCount] = await Promise.all([
    notifications.list(userId, unreadOnly, anchor),
    notifications.count(userId),
    notifications.unreadCount(userId),
  ]);
  return {
    items: items.slice(0, 50).map(({ id, kind, title, message, createdAt, readAt, href, actionLabel, tone }) => ({
      id, kind, title, message, createdAt: createdAt.toISOString(), readAt: readAt?.toISOString() ?? null, href, actionLabel, tone,
    })), total, unreadCount, nextCursor: items.length > 50 ? items[49].id : null,
  };
}
