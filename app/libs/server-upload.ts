import { randomUUID } from "node:crypto";
import cloudinary from "./cloudinary";
import { getNativeRepositories } from "./native-repositories";
import { ApiRequestError } from "./api-request";
import { logger } from "./logger";
import { MAX_UPLOAD_BYTES, uploadFormats, type UploadKind } from "./upload-policy";

export async function saveUploadedFile(input: { userId: string; kind: UploadKind; file: File; listingId?: string }) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud || !process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new ApiRequestError(503, "Uploads are temporarily unavailable.");
  }
  if (!input.file.size || input.file.size > MAX_UPLOAD_BYTES) throw new ApiRequestError(413, "Choose a file no larger than 4 MB.");
  const publicId = `bidlane/${input.userId}/${input.kind.toLowerCase()}/${randomUUID()}`;
  let attempted = false;
  try {
    // The SDK signs this server-chosen request. No signing capability or
    // provider API secret is returned to the browser. URLs are never fetched.
    const bytes = Buffer.from(await input.file.arrayBuffer());
    attempted = true;
    const result = await cloudinary.uploader.upload(`data:application/octet-stream;base64,${bytes.toString("base64")}`, {
      public_id: publicId, resource_type: "image", type: "upload", overwrite: false,
      use_filename: false, unique_filename: false, allowed_formats: uploadFormats(input.kind), timeout: 15000,
    });
    const expectedUrl = `https://res.cloudinary.com/${cloud}/image/upload/v${result.version}/${publicId}.${result.format}`;
    if (result.public_id !== publicId || result.resource_type !== "image" || result.type !== "upload" ||
      !Number.isSafeInteger(result.version) || result.version <= 0 ||
      !uploadFormats(input.kind).includes(result.format) || !Number.isSafeInteger(result.bytes) ||
      result.bytes <= 0 || result.bytes > MAX_UPLOAD_BYTES || result.secure_url !== expectedUrl) {
      throw new ApiRequestError(400, "Upload a JPG, PNG, or WebP photo, or a PDF vehicle record, up to 4 MB.");
    }
    await getNativeRepositories().assets.register({
      id: publicId, userId: input.userId, kind: input.kind, listingId: input.listingId ?? null,
      url: result.secure_url, bytes: result.bytes, format: result.format,
    });
    return result.secure_url;
  } catch (error) {
    if (attempted) {
      try { await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload", invalidate: true }); }
      catch { logger.warn("upload.orphan_cleanup_failed"); }
    }
    if (error instanceof ApiRequestError) throw error;
    if (typeof error === "object" && error !== null && "http_code" in error && error.http_code === 400) {
      throw new ApiRequestError(400, input.kind === "RECORD" ? "Choose a valid PDF, JPG, PNG, or WebP record." : "Choose a valid JPG, PNG, or WebP photo.");
    }
    // Provider/DB errors can contain file data or credentials. Do not log them.
    logger.warn("upload.storage_failed");
    throw new ApiRequestError(503, "The file could not be uploaded. Please try again.");
  }
}
