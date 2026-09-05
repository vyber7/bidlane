import getCurrentUser from "../../../app/actions/getCurrentUser";
import prisma from "../../libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  try {
    const body = await req.json();

    const { year, make, model, miles, reservePrice, location, description } =
      body.data;

    if (
      !year ||
      !make ||
      !model ||
      !miles ||
      !reservePrice ||
      !location ||
      !description
    ) {
      return new NextResponse("Missing Information", { status: 400 });
    }

    const listing = {
      year: +year,
      make,
      model,
      miles: +miles,
      reservePrice: +reservePrice,
      location,
      description,
    };
    const newListing = await prisma.listing.create({
      data: {
        user: {
          connect: {
            id: currentUser?.id,
          },
        },
        year: listing.year,
        make: listing.make,
        model: listing.model,
        reservePrice: listing.reservePrice,
        miles: listing.miles,
        location: listing.location,
        description: listing.description,
        images: [], // Images will be added later
      },
    });

    await prisma.user.update({
      where: {
        id: currentUser?.id,
      },
      data: {
        uploadList: {
          connect: {
            id: newListing.id,
          },
        },
      },
    });
    return NextResponse.json(newListing, { status: 201 });
  } catch (error: unknown) {
    logger.error("listing.create_failed", error, { userId: currentUser?.id });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
