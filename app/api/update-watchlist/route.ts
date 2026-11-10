import { getNativeRepositories, withNativeTransaction } from "@/app/libs/native-repositories";
import { engagementTransactionOptions, isTransactionContention } from "@/prisma/native/transaction-errors";
import getCurrentUser from "../../../app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { pusherServer } from "@/app/libs/pusher";
import { logger } from "@/app/libs/logger";
import type { WatchingUpdateEvent, WatchlistUpdateEvent, WatchlistResponse, WatcherCountEvent } from "@/app/types/auction-events";
import { serializeListing } from "@/app/utils/listing-serialization";
import { isPublicListing } from "@/app/libs/listing-review";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";

export async function POST(request: Request) {
  let userId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse("Unauthorized", 401);
    }

    userId = currentUser.id;
    const body = await readJsonObject(request);
    const listingId = requireListingId(body.listingId);
    const watching = body.watching;
    if (typeof watching !== "boolean") {
      throw new ApiRequestError(400, "Watchlist state must be a boolean");
    }

    await withNativeTransaction(async (tx) => {
      const listing = await tx.engagement.find(listingId);
      if (!listing || !isPublicListing(listing)) throw new ApiRequestError(404, "Listing not found");
      const updated = await tx.engagement.setWatch(listingId, currentUser.id, watching);
      if (updated.count !== 1) throw new ApiRequestError(404, "Listing not found");
    }, engagementTransactionOptions);

    // Read after the relation update so aggregates and the viewer's state
    // reflect persisted data. Never broadcast a listing removed from public view.
    const updatedListing = await getNativeRepositories().engagement.watchSnapshot(listingId, currentUser.id).catch(() => {
      // The watch change is committed; a failed notification snapshot must
      // not make the client roll back a successful write.
      logger.warn("watchlist.notification_failed", { listingId, userId: currentUser.id });
      return null;
    });
    if (!updatedListing || !isPublicListing({ status: updatedListing.listing.status, reviewStatus: updatedListing.reviewStatus })) {
      return NextResponse.json({ listingId, watching } satisfies WatchlistResponse);
    }
    const publicListing = updatedListing.listing;
    const update = { listingId, userId: currentUser.id, watching } satisfies WatchlistUpdateEvent;
    const notificationResults = await Promise.allSettled([
      pusherServer.trigger(
        `private-user-${currentUser.id}`,
        "watchlist-update",
        update
      ),
      pusherServer.trigger(
        `private-user-${currentUser.id}`,
        "watching-update",
        { listing: serializeListing(publicListing), watching } satisfies WatchingUpdateEvent
      ),
      pusherServer.trigger(
        `listing-${listingId}`,
        "watcher-count-update",
        { listingId, watcherCount: publicListing.watcherCount } satisfies WatcherCountEvent
      ),
    ]);

    if (notificationResults.some((result) => result.status === "rejected")) {
      logger.warn("watchlist.notification_failed", {
        listingId,
        userId: currentUser.id,
      });
    }

    return NextResponse.json({ listingId, watching } satisfies WatchlistResponse);
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (isTransactionContention(error)) return errorResponse("The listing is busy. Please try again.", 503);
    logger.error("watchlist.update_failed", error, { userId });
    return errorResponse("Unable to update watchlist", 500);
  }
}
