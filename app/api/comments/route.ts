import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { logger } from "@/app/libs/logger";
import type { CommentEvent, CommentResponse } from "@/app/types/auction-events";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the public comment payload sent to real-time subscribers

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const image = typeof body.image === "string" ? body.image : undefined;

    if (!comment)
      throw new ApiRequestError(400, "Comment is required");

    const newComment = await prisma.comment.create({
      data: {
        body: comment,
        image: image,
        //listingId: listingId,
        //userId: currentUser.id,
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
        // seen: {
        //   connect: {
        //     id: currentUser.id,
        //   },
        // },
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

    await prisma.listing.update({
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

    const commentPayload = { ...newComment, createdAt: newComment.createdAt.toISOString() } satisfies CommentEvent;
    const notification = await Promise.allSettled([
      pusherServer.trigger(`listing-${listingId}`, "new-comment", commentPayload),
    ]);
    if (notification[0]?.status === "rejected") {
      logger.warn("comment.notification_failed", { listingId });
    }

    return NextResponse.json({ comment: commentPayload } satisfies CommentResponse, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("comment.create_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
