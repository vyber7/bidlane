import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import type { WatchlistResponse } from "@/app/types/auction-events";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { setWatch, type WatchRejection } from "@/app/libs/engagement-commands";

const rejections = {
  "not-found": [404, "Listing not found"],
  busy: [503, "The listing is busy. Please try again."],
} as const satisfies Record<WatchRejection, readonly [number, string]>;

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

    const outcome = await setWatch({ watcher: currentUser, listingId, watching });
    if (!outcome.ok) {
      const [status, message] = rejections[outcome.reason];
      return errorResponse(message, status);
    }
    return NextResponse.json({ listingId, watching: outcome.watching } satisfies WatchlistResponse);
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("watchlist.update_failed", error, { userId });
    return errorResponse("Unable to update watchlist", 500);
  }
}
