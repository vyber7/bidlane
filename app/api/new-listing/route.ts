import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { NextResponse } from "next/server";
import { logger } from "@/app/libs/logger";
import { validateListing } from "@/app/libs/listing-validation";

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) return NextResponse.json({ error: "Please sign in to submit a listing." }, { status: 401 });
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const error = validateListing(body?.data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { year, make, model, miles, reservePrice, location, description, images } = body.data;
  try {
    const newListing = await prisma.listing.create({
      data: {
        user: { connect: { id: currentUser.id } },
        year: Number(year), make: make.trim(), model: model.trim(),
        miles: Number(miles),
        reservePrice: reservePrice === "" || reservePrice == null ? null : Number(reservePrice),
        location: location.trim(), description: description.trim(),
        images, coverImage: images[0],
      },
    });
    return NextResponse.json(newListing, { status: 201 });
  } catch (error: unknown) {
    logger.error("listing.create_failed", error, { userId: currentUser.id });
    return NextResponse.json({ error: "Your listing could not be submitted. Please try again." }, { status: 500 });
  }
}
