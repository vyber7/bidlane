import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { recordView, type ViewRejection } from "@/app/libs/engagement-commands";
import {
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";

const rejections = {
  "not-found": [404, "Listing not found"],
  busy: [503, "The listing is busy. Please try again."],
} as const satisfies Record<ViewRejection, readonly [number, string]>;

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);
    const listingId = requireListingId(body.listingId);
    const viewer = await getCurrentUser();

    const outcome = await recordView({ viewer: viewer?.id ? viewer : null, listingId });
    if (!outcome.ok) {
      const [status, message] = rejections[outcome.reason];
      return errorResponse(message, status);
    }
    return NextResponse.json({ views: outcome.views });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.view_failed", error);
    return errorResponse("Unable to record view", 500);
  }
}
