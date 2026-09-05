import { NextResponse } from "next/server";
import prisma from "../../../../libs/prismadb";
import { logger } from "@/app/libs/logger";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: listingId } = await context.params;
  const body = await request.json();
  const { url: coverImageUrl } = body;

  if (!coverImageUrl) {
    return NextResponse.json(
      { message: "No cover image URL provided" },
      { status: 400 }
    );
  }

  // Update the listing with the new cover image URL
  try {
    await prisma.listing.update({
      where: { id: listingId },
      data: { coverImage: coverImageUrl },
    });

    return NextResponse.json(
      {
        message: "Cover image updated successfully",
        coverImageUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("listing.cover_image_failed", error, { listingId });
    return NextResponse.json(
      { message: "Failed to update cover image" },
      { status: 500 }
    );
  }
}
