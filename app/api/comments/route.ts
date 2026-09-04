import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse, userAgent } from "next/server";
import prisma from "@/app/libs/prismadb";
import { pusherServer } from "@/app/libs/pusher";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the updated listing with the new comment

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    const body = await req.json();
    const { comment, image, listingId } = body;

    console.log("Server Data: ", body);

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

    await pusherServer.trigger(
      `listing-${listingId}`,
      "new-comment",
      newComment
    );

    const lastComment =
      updatedListing.comments[updatedListing.comments.length - 1];

    // updatedListing.commenters.map((commenter) => {
    //   pusherServer.trigger(commenter.email!, "listing-updated", {
    //     id: listingId,
    //     comments: lastComment,
    //   });
    // });

    return NextResponse.json(updatedListing, { status: 201 });
  } catch (error: unknown) {
    console.error(error, "ERROR_COMMENTS");
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
