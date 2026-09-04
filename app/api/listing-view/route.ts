import prisma from "@/app/libs/prismadb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { listingId, userId } = body;

    if (!listingId) {
      return new NextResponse("Missing Listing ID", { status: 400 });
    }
    if (!userId) {
      const updated = await prisma.listing.update({
        where: {
          id: listingId,
        },
        data: {
          views: {
            increment: 1,
          },
        },
      });
      return NextResponse.json(`${updated.views}`);
    } else {
      const updated = await prisma.listing.update({
        where: {
          id: listingId,
        },
        data: {
          views: {
            increment: 1,
          },
          seen: {
            connect: {
              id: userId,
            },
          },
        },
      });
      return NextResponse.json(
        `${updated.views} and listing seen updated: ${updated.seenIds}`
      );
    }
  } catch (error: unknown) {
    console.log(error, "VIEWS_ERROR");
    return new NextResponse("Internal Error", { status: 500 });
  }
}
