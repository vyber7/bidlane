import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { getNotificationFeed } from "@/app/account/lib/notifications";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject } from "@/app/libs/api-request";
import { publishNotificationChanges } from "@/app/libs/notifications";
import { logger } from "@/app/libs/logger";
import type { NotificationSummary } from "@/app/types/account";

const objectId = /^[a-f\d]{24}$/i;

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    const params = new URL(request.url).searchParams;
    if (params.get("summary") === "1") {
      const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
      return Response.json({ userId: user.id, unreadCount } satisfies NotificationSummary, { headers: { "Cache-Control": "private, no-store" } });
    }
    const cursor = params.get("cursor") ?? undefined;
    if (cursor && !objectId.test(cursor)) throw new ApiRequestError(400, "Invalid notification cursor");
    return Response.json(await getNotificationFeed(user.id, { cursor, unreadOnly: params.get("view") === "unread" }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("notification.load_failed", error);
    return errorResponse("Unable to load notifications", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    const body = await readJsonObject(request);
    let scope: { id: { in: string[] } } | { createdAt: { lte: Date } };
    if (body.all === true && body.ids === undefined && typeof body.before === "string") {
      const before = new Date(body.before);
      if (!Number.isFinite(before.getTime()) || before > new Date()) throw new ApiRequestError(400, "Invalid notification cutoff");
      scope = { createdAt: { lte: before } };
    } else if (body.all === undefined && Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every((id) => typeof id === "string" && objectId.test(id))) {
      scope = { id: { in: [...new Set(body.ids as string[])] } };
    } else throw new ApiRequestError(400, "Provide notification IDs or an all-read cutoff");
    const updated = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...scope }, data: { readAt: new Date() } });
    if (updated.count > 0) await publishNotificationChanges([user.id]);
    return Response.json({ updated: updated.count });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("notification.read_failed", error);
    return errorResponse("Unable to mark notifications as read", 500);
  }
}
