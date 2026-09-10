import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { logger } from "@/app/libs/logger";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
} from "@/app/api/auction-security";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the public comment payload sent to real-time subscribers

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return new NextResponse("Unauthorized", { status: 401 });

    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    const image = typeof body.image === "string" ? body.image : undefined;

    if (!comment)
      return new NextResponse("Missing Information", { status: 400 });

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

    const notification = await Promise.allSettled([
      pusherServer.trigger(`listing-${listingId}`, "new-comment", newComment),
    ]);
    if (notification[0]?.status === "rejected") {
      logger.warn("comment.notification_failed", { listingId });
    }

    return NextResponse.json({ comment: newComment }, { status: 201 });
  } catch (error: unknown) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("comment.create_failed", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
