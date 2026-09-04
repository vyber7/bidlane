import getCurrentUser from "@/app/actions/getCurrentUser";
import { NextResponse } from "next/server";
import prisma from "@/app/libs/prismadb";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
  requireSafeInteger,
} from "@/app/api/auction-security";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return new NextResponse("Unauthorized", { status: 401 });

    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const startingBid = requireSafeInteger(body.startingBid, "Starting bid", {
      allowZero: true,
    });
    const bidIncrement = requireSafeInteger(body.bidIncrement, "Bid increment");
    if (startingBid + bidIncrement > 2_147_483_647) {
      throw new AuctionRequestError(400, "Starting bid plus increment is too large");
    }
    const endTime =
      typeof body.endTime === "string" || typeof body.endTime === "number"
        ? new Date(body.endTime)
        : null;
    const startTime = new Date();

    if (!endTime || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
      throw new AuctionRequestError(400, "End time must be in the future");
    }

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new AuctionRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new AuctionRequestError(403, "Only the seller can start this auction");
    }
    if (listing.status !== "UPCOMING") {
      throw new AuctionRequestError(409, "Only an upcoming auction can be started");
    }

    const updated = await prisma.listing.updateMany({
      where: { id: listingId, userId: currentUser.id, status: "UPCOMING" },
      data: {
        auctionStartsAt: startTime,
        auctionEndsAt: endTime,
        startingBid,
        bidIncrement,
        status: "LIVE",
      },
    });

    if (updated.count !== 1) {
      throw new AuctionRequestError(409, "Auction has already been started");
    }

    return NextResponse.json(
      { message: "Auction started", auctionStartsAt: startTime, auctionEndsAt: endTime },
      { status: 201 }
    );
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    console.error("Error creating auction:", error);
    return new NextResponse("Failed to create auction", { status: 500 });
  }
}
