import getCurrentUser from "@/app/actions/getCurrentUser";
import { pusherServer } from "@/app/libs/pusher";
import { errorResponse } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);
    let body: FormData;
    try { body = await request.formData(); } catch { return errorResponse("Invalid authorization request", 400); }
    const socketId = body.get("socket_id");
    const channelName = body.get("channel_name");
    if (typeof socketId !== "string" || !/^\d+\.\d+$/.test(socketId)) return errorResponse("Invalid socket ID", 400);
    if (channelName !== `private-user-${user.id}`) return errorResponse("Forbidden", 403);
    return Response.json(pusherServer.authorizeChannel(socketId, channelName));
  } catch (error) {
    logger.error("notification.channel_auth_failed", error);
    return errorResponse("Unable to authorize notifications", 500);
  }
}
