import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject } from "@/app/libs/api-request";
import { profileSchema } from "@/app/schemas/account";

export async function PATCH(request: Request) {
  let userId: string | undefined;
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return errorResponse("Unauthorized", 401);
    }

    userId = currentUser.id;
    const { name, image } = parseApiInput(profileSchema, await readJsonObject(request));

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: { name, image: image || null },
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
