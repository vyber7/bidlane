import type { PrismaClient } from "@prisma/client";
import prisma from "./prismadb";
import { ApiRequestError } from "./api-request";
import type { UploadKind } from "./upload-policy";

type AssetDatabase = Pick<PrismaClient, "uploadedAsset">;

function isOwnCloudUrl(value: string) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) throw new ApiRequestError(503, "Uploads are temporarily unavailable.");
  try {
    const url = new URL(value);
    return url.origin === "https://res.cloudinary.com" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith(`/${cloud}/image/upload/`);
  } catch { return false; }
}

export async function assertOwnedAssets(input: {
  userId: string;
  kind: UploadKind;
  urls: readonly string[];
  existingUrls?: readonly string[];
  listingId?: string;
}, db: AssetDatabase = prisma) {
  // Legacy media is grandfathered only on the exact owned object being edited.
  // It cannot be imported into another draft, listing, account or media purpose.
  const existing = new Set(input.existingUrls ?? []);
  const urls = [...new Set(input.urls)].filter((url) => !existing.has(url));
  if (!urls.length) return;
  if (urls.some((url) => !isOwnCloudUrl(url))) {
    throw new ApiRequestError(400, "Use files uploaded through your BidLane account.");
  }
  const owned = await db.uploadedAsset.findMany({
    where: {
      userId: input.userId, kind: input.kind, url: { in: urls },
      ...(input.listingId ? { OR: [{ listingId: null }, { listingId: input.listingId }] } : { listingId: null }),
    },
    select: { url: true },
  });
  const allowed = new Set(owned.map((asset) => asset.url));
  if (urls.some((url) => !allowed.has(url))) {
    throw new ApiRequestError(400, "Use files uploaded through your BidLane account for this purpose.");
  }
}

export function recordUrls(records: unknown): string[] {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => record && typeof record === "object" && typeof record.url === "string" ? [record.url] : []);
}

export async function assertListingAssets(userId: string, media: { images: readonly string[]; vehicleRecords?: unknown }, existing?: {
  images?: readonly string[];
  vehicleRecords?: unknown;
  listingId?: string;
}, db: AssetDatabase = prisma) {
  await assertOwnedAssets({ userId, kind: "PHOTO", urls: media.images, existingUrls: existing?.images, listingId: existing?.listingId }, db);
  await assertOwnedAssets({ userId, kind: "RECORD", urls: recordUrls(media.vehicleRecords), existingUrls: recordUrls(existing?.vehicleRecords), listingId: existing?.listingId }, db);
}
