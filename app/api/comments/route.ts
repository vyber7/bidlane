import { assertOwnedAssets } from "@/app/libs/uploaded-assets";
import { enforceAbuseLimit } from "@/app/libs/abuse-limits";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { withNativeTransaction } from "@/app/libs/native-repositories";
import { engagementTransactionOptions, isTransactionContention } from "@/prisma/native/transaction-errors";
import { pusherServer } from "@/app/libs/pusher";
import {
  commentNotifications,
  publishNotificationChanges,
  saveNotifications,
} from "@/app/libs/notifications";
import { logger } from "@/app/libs/logger";
import type { CommentEvent, CommentResponse } from "@/app/types/auction-events";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  parseApiInput,
} from "@/app/libs/api-request";
import { commentRequestSchema } from "@/app/schemas/auction";
import { isPublicListing } from "@/app/libs/listing-review";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the public comment payload sent to real-time subscribers

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const { listingId, comment, image } = parseApiInput(commentRequestSchema, await readJsonObject(req, 32768));
    await enforceAbuseLimit("comment", currentUser.id);

    const { newComment, notificationUsers } = await withNativeTransaction(
      async (tx) => {
        const listing = await tx.engagement.find(listingId);
        if (!listing) throw new ApiRequestError(404, "Listing not found");
        if (!isPublicListing(listing)) throw new ApiRequestError(409, "Comments open after the listing is approved.");
        if (image) await assertOwnedAssets({ userId: currentUser.id, kind: "PHOTO", urls: [image], listingId });
        const now = new Date();
        const newComment = await tx.comments.create({ listingId, userId: currentUser.id, body: comment, image }, now);
        const touched = await tx.engagement.touchComment(listingId, now);
        if (touched.count !== 1) throw new ApiRequestError(409, "Comments open after the listing is approved.");
        const notificationUsers = await saveNotifications(
          tx,
          commentNotifications(listing, newComment, currentUser.id),
        );
        return { newComment, notificationUsers };
      }, engagementTransactionOptions,
    );

    const commentPayload = {
      ...newComment,
      createdAt: newComment.createdAt.toISOString(),
    } satisfies CommentEvent;
    const notification = await Promise.allSettled([
      publishNotificationChanges(notificationUsers),
      pusherServer.trigger(
        `listing-${listingId}`,
        "new-comment",
        commentPayload,
      ),
    ]);
    if (notification.some((item) => item.status === "rejected")) {
      logger.warn("comment.notification_failed", { listingId });
    }

    return NextResponse.json(
      { comment: commentPayload } satisfies CommentResponse,
      { status: 201 },
    );
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (isTransactionContention(error)) return errorResponse("The listing is busy. Please try again.", 503);
    logger.error("comment.create_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
