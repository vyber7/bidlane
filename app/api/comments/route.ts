import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";
import { logger } from "@/app/libs/logger";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the updated listing with the new comment

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    const body = await req.json();
    const { comment, image, listingId } = body;

    if (!currentUser?.id || !currentUser?.email)
      return new NextResponse("Unauthorized", { status: 401 });

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
      include: {
        // seen: true,
        user: true,
      },
    });

    const updatedListing = await prisma.listing.update({
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
      include: {
        commenters: true,
        comments: {
          include: {
            // seen: true,
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

    return NextResponse.json(updatedListing, { status: 201 });
  } catch (error: unknown) {
    logger.error("comment.create_failed", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
