import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject } from "@/app/libs/api-request";

export async function PATCH(request: Request) {
  let userId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse("Unauthorized", 401);
    }

    userId = currentUser.id;
    const { name, image } = await readJsonObject(request);
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new ApiRequestError(400, "Name must be between 2 and 60 characters");
    }

    if (typeof image !== "string" || image.length > 2048) {
      throw new ApiRequestError(400, "Invalid image");
    }

    if (image) {
      try {
        const imageUrl = new URL(image);
        if (imageUrl.protocol !== "https:") throw new Error("Invalid protocol");
      } catch {
        throw new ApiRequestError(400, "Invalid image URL");
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: { name: cleanName, image: image || null },
      select: { name: true, email: true, image: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("account.profile_update_failed", error, { userId });
    return errorResponse("Unable to update profile", 500);
  }
}
