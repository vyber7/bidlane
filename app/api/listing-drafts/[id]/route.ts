import { z } from "zod";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { deleteListingDraft, serializeDraft, updateListingDraft } from "@/app/libs/listing-drafts";
import { draftRevisionSchema, updateDraftSchema } from "@/app/schemas/listing-draft";
import { listingIdSchema } from "@/app/schemas/common";
import { logger } from "@/app/libs/logger";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const id = parseApiInput(listingIdSchema, (await params).id);
    const draft = await prisma.listingDraft.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!draft) return errorResponse("Draft not found.", 404);
    return Response.json(serializeDraft(draft), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const id = parseApiInput(listingIdSchema, (await params).id);
    const draft = await updateListingDraft(user.id, id, parseApiInput(updateDraftSchema, await readJsonObject(request)));
    return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in.", 401);
    const id = parseApiInput(listingIdSchema, (await params).id);
    const { revision } = parseApiInput(z.object({ revision: draftRevisionSchema }), await readJsonObject(request));
    await deleteListingDraft(user.id, id, revision);
    return Response.json({ deleted: true });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  const response = apiErrorResponse(error);
  if (response) return response;
  logger.warn("listing.draft_request_failed");
  return errorResponse("Could not update your draft. Please try again.", 503);
}
