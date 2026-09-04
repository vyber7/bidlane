import getCurrentUser from "../../../app/actions/getCurrentUser";
import prisma from "../../libs/prismadb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  try {
    const body = await req.json();

    // console.log("Server user/images: ");

    const { year, make, model, miles, reservePrice, location, description } =
      body.data;

    console.log("Body data: ", body.data);

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
    console.log("Listing to Create: ", listing);
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
    console.log("Listing created successfully");
    return NextResponse.json(newListing, { status: 201 });
  } catch (error: unknown) {
    console.log(error, "LISTING_ERROR");
    return new NextResponse("Internal Error", { status: 500 });
  }
}
