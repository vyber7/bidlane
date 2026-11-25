import { submitDraft } from "@/app/libs/listing-submission";
import { submitDraftSchema } from "@/app/schemas/listing-draft";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { isTransactionContention } from "@/prisma/native/transaction-errors";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";

// Submission only accepts a saved Draft. Listing data sent directly is
// rejected, so every Listing starts from the owner's saved snapshot.
export async function POST(req: Request) {
  let userId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return errorResponse("Please sign in to submit a listing.", 401);
    userId = currentUser.id;
    const { draftId, revision } = parseApiInput(submitDraftSchema, await readJsonObject(req));
    const listing = await submitDraft(currentUser, draftId, revision);
    // Replaying a submitted Draft can return a now-active Listing. The
    // submission UI needs only its ID, never other users' accumulated activity.
    return NextResponse.json({ id: listing.id }, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (isTransactionContention(error)) {
      return errorResponse("The listing changed while submitting. Retry with the same draft.", 503);
    }
    logger.error("listing.create_failed", error, { userId });
    return errorResponse("Your listing could not be submitted. Please try again.", 500);
  }
}
