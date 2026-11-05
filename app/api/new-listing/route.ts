import { parseApiInput } from "@/app/libs/api-request";
import { publishListingDraft } from "@/app/libs/listing-drafts";
import { publishDraftSchema } from "@/app/schemas/listing-draft";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import { parseListing } from "@/app/libs/listing-validation";
import { apiErrorResponse, errorResponse, readJsonObject } from "@/app/libs/api-request";

export async function POST(req: Request) {
  let userId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return errorResponse("Please sign in to submit a listing.", 401);
    userId = currentUser.id;
    const body = await readJsonObject(req);
    if (body.draftId !== undefined) {
      const { draftId, revision } = parseApiInput(publishDraftSchema, body);
      const listing = await publishListingDraft(currentUser.id, draftId, revision);
      // Replaying a published draft can return a now-active listing. The
      // submission UI needs only its ID, never other users' accumulated activity.
      return NextResponse.json({ id: listing.id }, { status: 201 });
    }
    const listing = parseListing(body.data);
    const newListing = await prisma.listing.create({
      data: {
        ...listing,
        reviewStatus: "PENDING",
        reviewRevision: 0,
        user: { connect: { id: currentUser.id } },
        coverImage: listing.images[0],
      },
    });
    return NextResponse.json({ id: newListing.id }, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return errorResponse("The listing changed while submitting. Retry with the same draft.", 503);
    }
    logger.error("listing.create_failed", error, { userId });
    return errorResponse("Your listing could not be submitted. Please try again.", 500);
  }
}
