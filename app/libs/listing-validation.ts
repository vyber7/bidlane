import { parseApiInput } from "@/app/libs/api-request";
import { listingSchema, type ValidatedListing } from "@/app/schemas/listing";

export { MAX_LISTING_PHOTOS, MAX_LISTING_NUMBER, isCloudinaryImageUrl } from "@/app/schemas/listing";
export type { ValidatedListing } from "@/app/schemas/listing";

export function parseListing(data: unknown): ValidatedListing {
  return parseApiInput(listingSchema, data);
}

export function validateListing(data: unknown): string | null {
  const result = listingSchema.safeParse(data);
  return result.success ? null : result.error.issues[0].message;
}
