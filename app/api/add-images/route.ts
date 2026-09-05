// app/api/add-images/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { imageUrl } = body;

  if (!imageUrl) {
    return NextResponse.json(
      { message: "No image URL provided" },
      { status: 400 }
    );
  }

  // Here you can add logic to save the image URL to your database if needed
  return NextResponse.json({
    message: "Image uploaded successfully",
    imageUrl,
  });
}
