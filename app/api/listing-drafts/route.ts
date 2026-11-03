import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { createListingDraft } from "@/app/libs/listing-drafts";
import { createDraftSchema } from "@/app/schemas/listing-draft";
import { logger } from "@/app/libs/logger";
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in to save a draft.", 401);
    const draft = await createListingDraft(user.id, parseApiInput(createDraftSchema, await readJsonObject(request)));
    return Response.json(draft, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("listing.draft_create_failed");
    return errorResponse("Your draft could not be saved. Please try again.", 503);
  }
}
