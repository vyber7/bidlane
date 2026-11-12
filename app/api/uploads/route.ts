import { z } from "zod";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import { ApiRequestError, apiErrorResponse, errorResponse, parseApiInput, requireListingId } from "@/app/libs/api-request";
import { MAX_UPLOAD_BODY_BYTES, MAX_UPLOAD_BYTES, UPLOAD_KINDS } from "@/app/libs/upload-policy";
import { uploadRetryAfter } from "@/app/libs/upload-rate-limit";
import { saveUploadedFile } from "@/app/libs/server-upload";
import { logger } from "@/app/libs/logger";

// Public, credential-free readiness contract for the coordinated cutover.
export async function GET() {
  return Response.json({ policy: "authenticated-4mb-v1", maxBytes: MAX_UPLOAD_BYTES }, { headers: { "Cache-Control": "no-store" } });
}

async function boundedForm(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) throw new ApiRequestError(400, "Choose a file to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_UPLOAD_BODY_BYTES) {
        await reader.cancel();
        throw new ApiRequestError(413, "Choose a file no larger than 4 MB.");
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch { throw new ApiRequestError(400, "Invalid file upload."); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Please sign in to upload files.", 401);
    const retryAfter = await uploadRetryAfter(user.id);
    if (retryAfter) return Response.json({ error: "Upload limit reached. Please try again later." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    const form = await boundedForm(request);
    for (const key of form.keys()) if (!["file", "kind", "listingId"].includes(key) || form.getAll(key).length !== 1) throw new ApiRequestError(400, "Invalid upload options.");
    const kind = parseApiInput(z.enum(UPLOAD_KINDS), form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ApiRequestError(400, "Choose a nonempty file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiRequestError(413, "Choose a file no larger than 4 MB.");
    const listingId = form.has("listingId") ? requireListingId(form.get("listingId")) : undefined;
    if (listingId && kind === "PROFILE") throw new ApiRequestError(400, "Profile uploads cannot target a listing.");
    if (listingId) {
      const listing = await getNativeRepositories().listingAuthoring.find(listingId);
      if (!listing || listing.userId !== user.id) return errorResponse("Listing not found.", 404);
      if (listing.status !== "UPCOMING") return errorResponse("Files cannot be changed after bidding opens.", 409);
    }
    const url = await saveUploadedFile({ userId: user.id, kind, file, listingId });
    return Response.json({ url }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.warn("upload.request_failed");
    return errorResponse("Uploads are temporarily unavailable. Please try again later.", 503);
  }
}
