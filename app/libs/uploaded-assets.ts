import { getNativeRepositories } from "./native-repositories";
import { ApiRequestError } from "./api-request";
import type { UploadKind } from "./upload-policy";

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
}) {
  // Legacy media is grandfathered only on the exact owned object being edited.
  // It cannot be imported into another draft, listing, account or media purpose.
  const existing = new Set(input.existingUrls ?? []);
  const urls = [...new Set(input.urls)].filter((url) => !existing.has(url));
  if (!urls.length) return;
  if (urls.some((url) => !isOwnCloudUrl(url))) {
    throw new ApiRequestError(400, "Use files uploaded through your BidLane account.");
  }
  // Registrations are immutable. This ownership read uses the independent
  // native pool even when the caller's listing/comment writes use a session.
  const owned = await getNativeRepositories().assets.findOwned({ userId: input.userId, kind: input.kind, urls, listingId: input.listingId });
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
}) {
  await assertOwnedAssets({ userId, kind: "PHOTO", urls: media.images, existingUrls: existing?.images, listingId: existing?.listingId });
  await assertOwnedAssets({ userId, kind: "RECORD", urls: recordUrls(media.vehicleRecords), existingUrls: recordUrls(existing?.vehicleRecords), listingId: existing?.listingId });
}
