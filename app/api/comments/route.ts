import { assertOwnedAssets } from "@/app/libs/uploaded-assets";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
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

    const { listingId, comment, image } = parseApiInput(commentRequestSchema, await readJsonObject(req));

    const { newComment, notificationUsers } = await prisma.$transaction(
      async (tx) => {
        const listing = await tx.listing.findUnique({
          where: { id: listingId },
        });
        if (!listing) throw new ApiRequestError(404, "Listing not found");
        if (!isPublicListing(listing)) throw new ApiRequestError(409, "Comments open after the listing is approved.");
        if (image) await assertOwnedAssets({ userId: currentUser.id, kind: "PHOTO", urls: [image], listingId }, tx);
        const newComment = await tx.comment.create({
          data: {
            body: comment,
            image: image,
            user: {
              connect: {
                id: currentUser.id,
              },
            },
            listing: {
              connect: {
                id: listingId,
              },
            },
          },
          select: {
            id: true,
            body: true,
            image: true,
            createdAt: true,
            listingId: true,
            user: { select: { name: true } },
          },
        });

        await tx.listing.update({
          where: {
            id: listingId,
          },
          data: {
            lastCommentAt: new Date(),
            comments: {
              connect: {
                id: newComment.id,
              },
            },
          },
        });
        const notificationUsers = await saveNotifications(
          tx,
          commentNotifications(listing, newComment, currentUser.id),
        );
        return { newComment, notificationUsers };
      },
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
    logger.error("comment.create_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
