import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import type { CommentResponse } from "@/app/types/auction-events";
import { apiErrorResponse, readJsonObject, errorResponse, parseApiInput } from "@/app/libs/api-request";
import { commentRequestSchema } from "@/app/schemas/auction";
import { postComment, type CommentRejection } from "@/app/libs/engagement-commands";

// POST /api/comments
// Required fields in the body: comment, listingId
// Optional fields in the body: image
// Returns the public comment payload sent to real-time subscribers

const rejections = {
  "not-found": [404, "Listing not found"],
  "not-public": [409, "Comments open after the listing is approved."],
  busy: [503, "The listing is busy. Please try again."],
} as const satisfies Record<CommentRejection, readonly [number, string]>;

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const { listingId, comment, image } = parseApiInput(commentRequestSchema, await readJsonObject(req, 32768));
    const outcome = await postComment({ author: currentUser, listingId, body: comment, image });
    if (!outcome.ok) {
      const [status, message] = rejections[outcome.reason];
      return errorResponse(message, status);
    }
    return NextResponse.json({ comment: outcome.comment } satisfies CommentResponse, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("comment.create_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
