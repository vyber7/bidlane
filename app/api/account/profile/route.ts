import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }

    const { name, image } = body as { name?: unknown; image?: unknown };
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (cleanName.length < 2 || cleanName.length > 60) {
      return NextResponse.json(
        { message: "Name must be between 2 and 60 characters" },
        { status: 400 }
      );
    }

    if (typeof image !== "string" || image.length > 2048) {
      return NextResponse.json({ message: "Invalid image" }, { status: 400 });
    }

    if (image) {
      try {
        const imageUrl = new URL(image);
        if (imageUrl.protocol !== "https:") throw new Error("Invalid protocol");
      } catch {
        return NextResponse.json({ message: "Invalid image URL" }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: { name: cleanName, image: image || null },
      select: { name: true, email: true, image: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    logger.error("account.profile_update_failed", error, { userId: currentUser.id });
    return NextResponse.json({ message: "Unable to update profile" }, { status: 500 });
  }
}
