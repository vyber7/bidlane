import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "../../libs/prismadb";
import { logger } from "@/app/libs/logger";
import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
} from "@/app/api/auction-security";
import {
  isCloudinaryImageUrl,
  MAX_LISTING_PHOTOS,
} from "@/app/libs/listing-validation";

export async function GET(req: Request) {
  const folder = new URL(req.url).searchParams.get("folder");

  try {
    const match = folder?.match(/^listing-([a-f\d]{24})$/i);
    if (!match) {
      throw new AuctionRequestError(400, "Invalid listing image folder");
    }

    const listingId = requireListingId(match[1]);
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { images: true },
    });
    if (!listing) throw new AuctionRequestError(404, "Listing not found");

    const images = listing.images.map((url) => ({ url }));
    return NextResponse.json({ images });
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("cloudinary.images_route_failed", error, { folder });
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    if (!isJsonObject(body)) {
      throw new AuctionRequestError(400, "Invalid request body");
    }

    const listingId = requireListingId(body.listingId);
    const imageUrl = body.imageUrl;
    if (!isCloudinaryImageUrl(imageUrl, listingId)) {
      throw new AuctionRequestError(400, "Invalid listing image URL");
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, images: true },
    });
    if (!listing) throw new AuctionRequestError(404, "Listing not found");
    if (listing.userId !== currentUser.id) {
      throw new AuctionRequestError(403, "Only the seller can update this listing");
    }
    if (listing.images.includes(imageUrl)) {
      return NextResponse.json({ message: "Image already saved", imageUrl });
    }
    if (listing.images.length >= MAX_LISTING_PHOTOS) {
      throw new AuctionRequestError(
        409,
        "This listing already has the maximum number of images"
      );
    }

    const updated = await prisma.listing.updateMany({
      where: {
        id: listingId,
        userId: currentUser.id,
        images: { equals: listing.images },
      },
      data: { images: { push: imageUrl } },
    });
    if (updated.count !== 1) {
      throw new AuctionRequestError(
        409,
        "Listing images changed; please try again"
      );
    }

    return NextResponse.json({
      message: "Image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    const response = auctionErrorResponse(error);
    if (response) return response;
    logger.error("cloudinary.image_save_failed", error);
    return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
  }
}
