import { assertOwnedAssets } from "@/app/libs/uploaded-assets";
import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { getNativeRepositories } from "@/app/libs/native-repositories";
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

    await assertOwnedAssets({ userId: currentUser.id, kind: "PROFILE", urls: image ? [image] : [], existingUrls: currentUser.image ? [currentUser.image] : [] });
    const updatedUser = await getNativeRepositories().users.updateProfile(currentUser.id, { name, image: image || null });

    return NextResponse.json(updatedUser);
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("account.profile_update_failed", error, { userId });
    return errorResponse("Unable to update profile", 500);
  }
}
