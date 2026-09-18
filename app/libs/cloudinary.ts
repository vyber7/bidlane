// app/libs/cloudinary.ts or lib/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import { logger } from "./logger";

interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  created_at: string;
}

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function getCloudinaryImages(folder?: string, maxResults = 100) {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: folder, // optional: filter by folder/prefix
      max_results: maxResults,
      resource_type: "image",
    });

    return result.resources.map((resource: CloudinaryResource) => ({
      publicId: resource.public_id,
      url: resource.secure_url,
      width: resource.width,
      height: resource.height,
      format: resource.format,
      createdAt: resource.created_at,
    }));
  } catch (error) {
    logger.error("cloudinary.images_fetch_failed", error, { folder });
    throw error;
  }
}

export default cloudinary;
