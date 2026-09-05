import prisma from "../../libs/prismadb";
import getCurrentUser from "../../../app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { pusherServer } from "@/app/libs/pusher";
import { logger } from "@/app/libs/logger";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { listingId, watching } = body as Record<string, unknown>;
    if (typeof listingId !== "string" || typeof watching !== "boolean") {
      return NextResponse.json(
        { error: "A listing ID and watchlist state are required" },
        { status: 400 }
      );
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        watchList: watching
          ? { connect: { id: listingId } }
          : { disconnect: { id: listingId } },
      },
    });

    const update = { listingId, userId: currentUser.id, watching };
    const notificationResults = await Promise.allSettled([
      pusherServer.trigger(
        `listing-${listingId}`,
        "watchlist-update",
        update
      ),
      pusherServer.trigger(
        `user-${currentUser.id}-watching`,
        "watching-update",
        { listing, watching }
      ),
    ]);

    if (notificationResults.some((result) => result.status === "rejected")) {
      logger.warn("watchlist.notification_failed", {
        listingId,
        userId: currentUser.id,
      });
    }

    return NextResponse.json({ listingId, watching });
  } catch (error: unknown) {
    logger.error("watchlist.update_failed", error, { userId: currentUser.id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
