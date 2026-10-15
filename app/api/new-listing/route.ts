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
    const listing = parseListing(body.data);
    const newListing = await prisma.listing.create({
      data: {
        ...listing,
        user: { connect: { id: currentUser.id } },
        coverImage: listing.images[0],
      },
    });
    return NextResponse.json(newListing, { status: 201 });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.create_failed", error, { userId });
    return errorResponse("Your listing could not be submitted. Please try again.", 500);
  }
}
