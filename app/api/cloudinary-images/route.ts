// app/api/cloudinary-images/route.ts
import { NextResponse } from "next/server";
import { getCloudinaryImages } from "@/app/libs/cloudinary";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "../../libs/prismadb";
import { logger } from "@/app/libs/logger";

// Handle GET request to fetch images from Cloudinary
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const folder = searchParams.get("folder");
  try {
    const images = await getCloudinaryImages(folder as string);

    return NextResponse.json({ images });
  } catch (error) {
    logger.error("cloudinary.images_route_failed", error, { folder });
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}

// Handle POST request to save image URL to database
export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const { imageUrl, listingId } = body;

  if (!imageUrl) {
    return NextResponse.json(
      { message: "No image URL provided" },
      { status: 400 }
    );
  }

  // Here you can add logic to save the image URL to your database if needed
  await prisma.listing.update({
    where: {
      // Assuming you have listingId in the body to associate the image with a listing
      id: listingId,
    },
    data: {
      images: {
        push: imageUrl,
      },
    },
  });

  return NextResponse.json({
    message: "Image uploaded successfully",
    imageUrl,
  });
}
