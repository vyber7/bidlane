import { z } from "zod";
import { reviewRevisionSchema } from "@/app/schemas/listing-review";
import { isCloudinaryImageUrl, listingSchema, MAX_LISTING_PHOTOS } from "@/app/schemas/listing";
import { vehicleRecordsSchema, vinSchema } from "@/app/schemas/vehicle-trust";
import { ApiRequestError, parseApiInput } from "./api-request";
import { getNativeRepositories } from "./native-repositories";
import { assertListingAssets, assertOwnedAssets, recordUrls } from "./uploaded-assets";

/** The Listing to correct and the user asking to correct it. */
export type CorrectionTarget = { listingId: string; sellerId: string };

/** One seller change to a submitted Listing. Input is untrusted; each kind validates its own. */
export type Correction =
  | { kind: "details"; revision: unknown; data: unknown; coverImage?: unknown }
  | { kind: "records"; vin: unknown; vehicleRecords: unknown }
  | { kind: "coverPhoto"; url: unknown }
  | { kind: "galleryPhoto"; url: unknown };

type LoadedListing = NonNullable<Awaited<ReturnType<ReturnType<typeof getNativeRepositories>["listingAuthoring"]["find"]>>>;

const refusals = {
  missing: "Listing not found.",
  forbidden: "Only the seller can edit this listing.",
  closed: "Listings cannot be edited after bidding opens.",
  stale: "This listing changed. Reload before editing again.",
};

const recordsSchema = z.object({ vin: vinSchema, vehicleRecords: vehicleRecordsSchema });

function assertPhotoUrl(url: unknown): asserts url is string {
  if (!isCloudinaryImageUrl(url)) throw new ApiRequestError(400, "Invalid listing image URL");
}

function assertPhotoCapacity(images: readonly string[]) {
  if (images.length >= MAX_LISTING_PHOTOS) {
    throw new ApiRequestError(409, "This listing already has the maximum number of images");
  }
}

/**
 * Validates one Correction against the loaded Listing and returns the fields it
 * changes, or null when the Listing already has them.
 */
async function changesFor(correction: Correction, listing: LoadedListing, { listingId, sellerId }: CorrectionTarget) {
  switch (correction.kind) {
    case "details": {
      if (parseApiInput(reviewRevisionSchema, correction.revision) !== listing.reviewRevision) {
        throw new ApiRequestError(409, refusals.stale);
      }
      const data = parseApiInput(listingSchema, correction.data);
      await assertListingAssets(sellerId, data, { images: listing.images, vehicleRecords: listing.vehicleRecords, listingId });
      const coverImage = typeof correction.coverImage === "string" && data.images.includes(correction.coverImage)
        ? correction.coverImage
        : data.images[0];
      return { ...data, vin: data.vin || null, coverImage };
    }
    case "records": {
      const { vin, vehicleRecords } = parseApiInput(recordsSchema, { vin: correction.vin, vehicleRecords: correction.vehicleRecords });
      await assertOwnedAssets({
        userId: sellerId,
        kind: "RECORD",
        urls: recordUrls(vehicleRecords),
        existingUrls: recordUrls(listing.vehicleRecords),
        listingId,
      });
      return { vin: vin || null, vehicleRecords };
    }
    case "coverPhoto": {
      const { url } = correction;
      assertPhotoUrl(url);
      const { images, coverImage } = listing;
      await assertOwnedAssets({
        userId: sellerId,
        kind: "PHOTO",
        urls: [url],
        existingUrls: coverImage ? [...images, coverImage] : images,
        listingId,
      });
      if (images.includes(url)) return { coverImage: url };
      assertPhotoCapacity(images);
      return { coverImage: url, images: [...images, url] };
    }
    case "galleryPhoto": {
      const { url } = correction;
      assertPhotoUrl(url);
      const { images } = listing;
      if (images.includes(url)) return null;
      assertPhotoCapacity(images);
      await assertOwnedAssets({ userId: sellerId, kind: "PHOTO", urls: [url], listingId });
      return { images: [...images, url] };
    }
  }
}

/**
 * Applies one Correction and returns the Listing to Awaiting review in the same
 * guarded save. Refused unless the user is the seller, bidding has not opened
 * and the Listing is unchanged since it was loaded.
 */
export async function correctListing(target: CorrectionTarget, correction: Correction) {
  const { listingId, sellerId } = target;
  const repository = getNativeRepositories().listingAuthoring;
  const listing = await repository.find(listingId);
  if (!listing) throw new ApiRequestError(404, refusals.missing);
  if (listing.userId !== sellerId) throw new ApiRequestError(403, refusals.forbidden);
  if (listing.status !== "UPCOMING") throw new ApiRequestError(409, refusals.closed);

  const changes = await changesFor(correction, listing, target);
  const revision = listing.reviewRevision;
  if (!changes) return { changed: false, reviewStatus: listing.reviewStatus, reviewRevision: revision };

  const awaitingReview = { reviewStatus: "PENDING" as const, reviewNote: null, reviewRevision: revision + 1 };
  const saved = await repository.saveCorrection(listingId, sellerId, revision, { ...changes, ...awaitingReview }, new Date());
  if (saved.count !== 1) throw new ApiRequestError(409, refusals.stale);
  return { changed: true, reviewStatus: awaitingReview.reviewStatus, reviewRevision: awaitingReview.reviewRevision };
}
