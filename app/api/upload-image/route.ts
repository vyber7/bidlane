import { NextResponse } from "next/server";
import { ApiRequestError, apiErrorResponse, errorResponse, readJsonObject } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";

// Placeholder: accepts an image URL without uploading or persisting a file.
export async function POST(request: Request) {
  try {
    const { imageUrl } = await readJsonObject(request);
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      throw new ApiRequestError(400, "No image URL provided");
    }
    return NextResponse.json({ message: "Image uploaded successfully", imageUrl });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("upload_image.request_failed", error);
    return errorResponse("Unable to process image", 500);
  }
}
