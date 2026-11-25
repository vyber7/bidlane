import { z } from "zod";
import { reviewRevisionSchema } from "@/app/schemas/listing-review";
import { vehicleRecordsSchema, vinSchema } from "@/app/schemas/vehicle-trust";
import { ApiRequestError, parseApiInput } from "./api-request";
import { isCloudinaryImageUrl, listingSchema, MAX_LISTING_PHOTOS } from "@/app/schemas/listing";
import { getNativeRepositories } from "./native-repositories";
import { assertListingAssets, assertOwnedAssets, recordUrls } from "./uploaded-assets";

type CorrectionTarget = { listingId: string; sellerId: string };
type ReadCorrectionInput = () => Promise<Record<string, unknown>>;

const listingChanged = "This listing changed. Reload before editing again.";
const photoChecks = {
  missing: "Listing not found",
  forbidden: "Only the seller can update this listing",
  closed: "Photos cannot be changed after bidding opens.",
};
const correctionMessages = {
  listing: {
    missing: "Listing not found.",
    forbidden: "Only the seller can edit this listing.",
    closed: "Listings cannot be edited after bidding opens.",
    conflict: listingChanged,
  },
  records: {
    missing: "Listing not found.",
    forbidden: "Only the seller can edit these details.",
    closed: "VIN and records can only be changed before bidding opens.",
    conflict: "The auction changed. Refresh before editing.",
  },
  cover: { ...photoChecks, conflict: "Listing changed while updating the cover image" },
  gallery: { ...photoChecks, conflict: "Listing images changed; please try again" },
};

const recordsSchema = z.object({ vin: vinSchema, vehicleRecords: vehicleRecordsSchema });

async function prepareCorrection(kind: keyof typeof correctionMessages, { listingId, sellerId }: CorrectionTarget) {
  const messages = correctionMessages[kind];
  const repository = getNativeRepositories().listingAuthoring;
  const listing = await repository.find(listingId);
  if (!listing) throw new ApiRequestError(404, messages.missing);
  if (listing.userId !== sellerId) throw new ApiRequestError(403, messages.forbidden);
  if (listing.status !== "UPCOMING") throw new ApiRequestError(409, messages.closed);

  return { repository, listing, revision: listing.reviewRevision ?? 0, conflict: messages.conflict };
}

function assertSaved(count: number, conflict: string) {
  if (count !== 1) throw new ApiRequestError(409, conflict);
}

function assertPhotoCapacity(images: readonly string[]) {
  if (images.length >= MAX_LISTING_PHOTOS) {
    throw new ApiRequestError(409, "This listing already has the maximum number of images");
  }
}

export async function correctListing(target: CorrectionTarget, readInput: ReadCorrectionInput) {
  const { listingId, sellerId } = target;
  const { repository, listing, revision, conflict } = await prepareCorrection("listing", target);
  const body = await readInput();
  if (parseApiInput(reviewRevisionSchema, body.revision) !== revision) {
    throw new ApiRequestError(409, conflict);
  }

  const data = parseApiInput(listingSchema, body.data);
  await assertListingAssets(sellerId, data, {
    images: listing.images,
    vehicleRecords: listing.vehicleRecords,
    listingId,
  });
  const coverImage = typeof body.coverImage === "string" && data.images.includes(body.coverImage)
    ? body.coverImage
    : data.images[0];
  const updated = await repository.edit(listingId, sellerId, revision, data, coverImage, new Date());
  assertSaved(updated.count, conflict);
  return { reviewRevision: revision + 1, reviewStatus: "PENDING" as const };
}

export async function correctVehicleRecords(target: CorrectionTarget, readInput: ReadCorrectionInput) {
  const { listingId, sellerId } = target;
  const { repository, listing, revision, conflict } = await prepareCorrection("records", target);
  const { vin, vehicleRecords } = parseApiInput(recordsSchema, await readInput());
  await assertOwnedAssets({
    userId: sellerId,
    kind: "RECORD",
    urls: recordUrls(vehicleRecords),
    existingUrls: recordUrls(listing.vehicleRecords),
    listingId,
  });
  const updated = await repository.editRecords(listingId, sellerId, revision, { vin: vin || null, vehicleRecords }, new Date());
  assertSaved(updated.count, conflict);
}

export async function correctCoverImage(target: CorrectionTarget, url: unknown) {
  if (!isCloudinaryImageUrl(url)) throw new ApiRequestError(400, "Invalid cover image URL");

  const { listingId, sellerId } = target;
  const { repository, listing, revision, conflict } = await prepareCorrection("cover", target);
  const { images, coverImage } = listing;
  await assertOwnedAssets({
    userId: sellerId,
    kind: "PHOTO",
    urls: [url],
    existingUrls: coverImage ? [...images, coverImage] : images,
    listingId,
  });
  if (!images.includes(url)) assertPhotoCapacity(images);
  const updated = await repository.editCover(listingId, sellerId, revision, url, images, new Date());
  assertSaved(updated.count, conflict);
  return { coverImageUrl: url };
}

export async function addGalleryPhoto(target: CorrectionTarget, url: unknown) {
  if (!isCloudinaryImageUrl(url)) throw new ApiRequestError(400, "Invalid listing image URL");

  const { listingId, sellerId } = target;
  const { repository, listing, revision, conflict } = await prepareCorrection("gallery", target);
  if (listing.images.includes(url)) return { alreadySaved: true, imageUrl: url };

  assertPhotoCapacity(listing.images);
  await assertOwnedAssets({ userId: sellerId, kind: "PHOTO", urls: [url], listingId });
  const updated = await repository.addPhoto(listingId, sellerId, revision, listing.images, url, new Date());
  assertSaved(updated.count, conflict);
  return { alreadySaved: false, imageUrl: url };
}
