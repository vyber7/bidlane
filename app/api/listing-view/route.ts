import prisma from "@/app/libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  ApiRequestError,
  apiErrorResponse,
  readJsonObject,
  errorResponse,
  requireListingId,
} from "@/app/libs/api-request";

const MAX_VIEW_COUNT = 2_147_483_647;

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req);

    const listingId = requireListingId(body.listingId);
    const currentUser = await getCurrentUser();

    if (!currentUser?.id) {
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { views: true },
      });
      if (!listing) throw new ApiRequestError(404, "Listing not found");
      return NextResponse.json({ views: listing.views });
    }

    const views = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { views: true },
      });
      if (!listing) throw new ApiRequestError(404, "Listing not found");

      const counted = await tx.listing.updateMany({
        where: {
          id: listingId,
          views: { lt: MAX_VIEW_COUNT },
          NOT: { seenIds: { has: currentUser.id } },
        },
        data: {
          views: { increment: 1 },
          seenIds: { push: currentUser.id },
        },
      });

      if (counted.count === 1) {
        await tx.user.updateMany({
          where: {
            id: currentUser.id,
            NOT: { seenListIds: { has: listingId } },
          },
          data: { seenListIds: { push: listingId } },
        });
      }

      if (counted.count === 0) return listing.views;
      return Math.min(listing.views + 1, MAX_VIEW_COUNT);
    });

    return NextResponse.json({ views });
  } catch (error: unknown) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("listing.view_failed", error);
    return errorResponse("Unable to record view", 500);
  }
}
