import prisma from "../../libs/prismadb";
import getCurrentUser from "../../../app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { pusherServer } from "@/app/libs/pusher";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const body = await request.json();
    const { listingId } = body;
    const listing = await prisma.listing.findUnique({
      where: {
        id: listingId,
      },
      include: {
        watchers: true,
      },
    });

    const addToWatchList = async () => {
      await prisma.user.update({
        where: {
          id: currentUser.id,
        },
        data: {
          watchList: {
            connect: {
              id: listingId,
            },
          },
        },
      });

      console.log(`Added ${listingId} (${listing?.make}) to watchlist`);

      await pusherServer.trigger(`listing-${listingId}`, "watchlist-update", {
        listingId: listingId,
        userId: currentUser.id,
      });

      await pusherServer.trigger(
        `user-${currentUser.id}-watching`,
        "watching-update",
        listing
      );
    };

    const removeFromWatchList = async () => {
      await prisma.user.update({
        where: {
          id: currentUser.id,
        },
        data: {
          watchList: {
            disconnect: {
              id: listingId,
            },
          },
        },
      });

      console.log(`Removed ${listingId} (${listing?.make}) from watchlist`);

      await pusherServer.trigger(`listing-${listingId}`, "watchlist-update", {
        listingId: listingId,
        userId: currentUser.id,
      });

      await pusherServer.trigger(
        `user-${currentUser.id}-watching`,
        "watching-update",
        listing
      );
    };

    if (currentUser?.watchListIds.includes(listingId)) {
      removeFromWatchList();
    } else {
      addToWatchList();
    }

    return NextResponse.json(currentUser, { status: 201 });
  } catch (error: unknown) {
    console.log(error, "WATCHLIST_ERROR");
    //console.error(error, "REGISTRATION_ERROR");
    return new NextResponse("Internal Error", { status: 500 });
  }
}
