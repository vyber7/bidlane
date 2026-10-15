import prisma from "@/app/libs/prismadb";
import type { NotificationFeed } from "@/app/types/account";
import { ApiRequestError } from "@/app/libs/api-request";

export async function getNotificationFeed(userId: string, { cursor, unreadOnly = false }: { cursor?: string; unreadOnly?: boolean } = {}): Promise<NotificationFeed> {
  const anchor = cursor ? await prisma.notification.findFirst({ where: { id: cursor, userId }, select: { id: true, createdAt: true } }) : null;
  if (cursor && !anchor) {
    throw new ApiRequestError(400, "Invalid notification cursor");
  }
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { readAt: null }),
        ...(anchor && { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    items: items.slice(0, 50).map(({ id, kind, title, message, createdAt, readAt, href, actionLabel, tone }) => ({
      id, kind, title, message, createdAt: createdAt.toISOString(), readAt: readAt?.toISOString() ?? null, href, actionLabel, tone,
    })), total, unreadCount, nextCursor: items.length > 50 ? items[49].id : null,
  };
}
