import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
} from "@/app/api/auction-security";
import { logger } from "@/app/libs/logger";
import { finalizeAuction } from "@/app/libs/auction-finalization";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });

    if (!listing) throw new AuctionRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new AuctionRequestError(403, "Only the seller can end this auction");
    }
    if (listing.status !== "LIVE" || !listing.auctionEndsAt) {
      throw new AuctionRequestError(409, "Auction is not live");
    }
    const endRequestTime = new Date();
    if (listing.auctionEndsAt > endRequestTime) {
      throw new AuctionRequestError(409, "Auction cannot end before its scheduled time");
    }

    const finalization = await finalizeAuction(listingId, endRequestTime);
    if (finalization.status !== "finalized") {
      throw new AuctionRequestError(409, "Auction has already ended");
    }

    return NextResponse.json({
      message: "Auction ended successfully",
      result: finalization.result,
    });
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("auction.end_failed", error);
    return new NextResponse(JSON.stringify({ error: "Error ending auction" }), {
      status: 500,
    });
  }
}
