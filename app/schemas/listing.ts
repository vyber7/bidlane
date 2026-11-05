import { z } from "zod";
import { vinSchema, vehicleRecordsSchema } from "./vehicle-trust";
import { MAX_INTEGER, requiredTextSchema } from "./common";
import { MAX_VEHICLE_DISCLOSURE_LENGTH, vehicleDisclosureFields, vehicleSpecificationFields } from "@/app/libs/vehicle-details";

export const MAX_LISTING_PHOTOS = 20;
export const MAX_LISTING_NUMBER = MAX_INTEGER;

export function isCloudinaryImageUrl(value: unknown, listingId?: string): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || !url.pathname.includes("/image/upload/")) return false;
    return !listingId || url.pathname.split("/").includes(`listing-${listingId}`);
  } catch {
    return false;
  }
}

function listingNumberSchema(field: "year" | "miles" | "reservePrice") {
  return z.custom<string | number>((value) => {
    if (typeof value !== "string" && typeof value !== "number") return false;
    const min = field === "year" ? 1886 : 0;
    // Evaluate the year at parse time, including in long-running processes.
    const max = field === "year" ? new Date().getFullYear() + 1 : MAX_LISTING_NUMBER;
    return String(value).trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
  }, { error: `Please enter a valid ${field}.` }).transform(Number);
}

function specificationSchema<const T extends readonly string[]>(field: { label: string; options: T }) {
  const message = `Please select a valid ${field.label.toLowerCase()}.`;
  return z.string({ error: message }).pipe(z.enum(field.options, { error: message }));
}

function disclosureSchema(field: typeof vehicleDisclosureFields[number]) {
  return requiredTextSchema(`Please provide ${field.label.toLowerCase()}.`).refine(
    (value) => value.length <= MAX_VEHICLE_DISCLOSURE_LENGTH,
    `${field.label} must be ${MAX_VEHICLE_DISCLOSURE_LENGTH} characters or fewer.`,
  );
}

const photosRequired = `Please add between 1 and ${MAX_LISTING_PHOTOS} photos.`;
const uploadedPhotoRequired = "Please use uploaded images for your listing.";

export const listingSchema = z.object({
  vin: vinSchema.optional(),
  vehicleRecords: vehicleRecordsSchema.optional(),
  make: requiredTextSchema("Please enter a make.").max(100),
  model: requiredTextSchema("Please enter a model.").max(100),
  location: requiredTextSchema("Please enter a location.").max(200),
  description: requiredTextSchema("Please enter a description.").max(10000),
  year: listingNumberSchema("year"),
  miles: listingNumberSchema("miles"),
  reservePrice: z.preprocess(
    (value) => value === "" || value == null ? null : value,
    listingNumberSchema("reservePrice").nullable(),
  ),
  transmission: specificationSchema(vehicleSpecificationFields[0]),
  drivetrain: specificationSchema(vehicleSpecificationFields[1]),
  titleStatus: specificationSchema(vehicleSpecificationFields[2]),
  serviceHistory: disclosureSchema(vehicleDisclosureFields[0]),
  modifications: disclosureSchema(vehicleDisclosureFields[1]),
  knownFlaws: disclosureSchema(vehicleDisclosureFields[2]),
  images: z.array(z.custom<string>(isCloudinaryImageUrl, { error: uploadedPhotoRequired }), { error: photosRequired })
    .min(1, photosRequired).max(MAX_LISTING_PHOTOS, photosRequired),
}, { error: "Please provide listing details." });

export type ValidatedListing = z.output<typeof listingSchema>;
