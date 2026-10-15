import { ApiRequestError, isJsonObject } from "@/app/libs/api-request";

export const MAX_LISTING_PHOTOS = 10;
export const MAX_LISTING_NUMBER = 2147483647;

export function isCloudinaryImageUrl(
  value: unknown,
  listingId?: string
): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;

  try {
    const url = new URL(value);
    const isCloudinaryImage =
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.includes("/image/upload/");

    if (!isCloudinaryImage) return false;
    return !listingId || url.pathname.split("/").includes(`listing-${listingId}`);
  } catch {
    return false;
  }
}

export interface ValidatedListing {
  make: string;
  model: string;
  year: number;
  miles: number;
  reservePrice: number | null;
  location: string;
  description: string;
  images: string[];
}

function listingText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRequestError(400, `Please enter a ${field}.`);
  }
  return value.trim();
}

function listingNumber(value: unknown, field: "year" | "miles" | "reservePrice"): number {
  const min = field === "year" ? 1886 : 0;
  const max = field === "year" ? new Date().getFullYear() + 1 : MAX_LISTING_NUMBER;
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    String(value).trim() === "" || !Number.isInteger(Number(value)) ||
    Number(value) < min || Number(value) > max
  ) {
    throw new ApiRequestError(400, `Please enter a valid ${field}.`);
  }
  return Number(value);
}

export function parseListing(data: unknown): ValidatedListing {
  if (!isJsonObject(data)) throw new ApiRequestError(400, "Please provide listing details.");

  const make = listingText(data.make, "make");
  const model = listingText(data.model, "model");
  const location = listingText(data.location, "location");
  const description = listingText(data.description, "description");
  const year = listingNumber(data.year, "year");
  const miles = listingNumber(data.miles, "miles");
  const reservePrice = data.reservePrice === "" || data.reservePrice == null
    ? null : listingNumber(data.reservePrice, "reservePrice");
  const images = data.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > MAX_LISTING_PHOTOS) {
    throw new ApiRequestError(400, `Please add between 1 and ${MAX_LISTING_PHOTOS} photos.`);
  }
  if (!images.every((image: unknown): image is string => isCloudinaryImageUrl(image))) {
    throw new ApiRequestError(400, "Please use uploaded images for your listing.");
  }
  return { make, model, location, description, year, miles, reservePrice, images };
}

export function validateListing(data: unknown): string | null {
  try {
    parseListing(data);
    return null;
  } catch (error) {
    if (error instanceof ApiRequestError) return error.message;
    throw error;
  }
}
