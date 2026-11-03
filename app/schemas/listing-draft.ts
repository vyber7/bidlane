import { z } from "zod";
import { isCloudinaryImageUrl, MAX_LISTING_PHOTOS } from "./listing";
import { listingIdSchema } from "./common";
import { vehicleRecordSchema, MAX_VEHICLE_RECORDS } from "./vehicle-trust";

export const photoChecklistItems = [
  { id: "exterior", label: "Exterior", hint: "Front, rear, both sides, and three-quarter views in even daylight." },
  { id: "interior", label: "Interior", hint: "Seats, dashboard, odometer, controls, and trunk or cargo area." },
  { id: "engine", label: "Engine bay", hint: "A clear overall view, plus relevant components or modifications." },
  { id: "underside", label: "Underside", hint: "Underbody and suspension where safely accessible. Never get under an unsupported vehicle." },
  { id: "wheels", label: "Wheels & tires", hint: "All wheels, tire tread, and any curb damage or unusual wear." },
  { id: "damage", label: "Known damage & flaws", hint: "Close-ups of scratches, rust, dents, leaks, or wear mentioned in your disclosures." },
] as const;
const checklistId = z.enum(["exterior", "interior", "engine", "underside", "wheels", "damage"]);
const text = (max: number) => z.string().max(max).default("");
// Keep incomplete and temporarily invalid inputs as entered. Full listing
// validation runs only at publication; drafts still have storage/URL bounds.
export const draftDetailsSchema = z.object({
  vin: text(30), make: text(100), model: text(100), year: text(32), miles: text(32), reservePrice: text(32),
  location: text(200), description: text(10000), transmission: text(100), drivetrain: text(100), titleStatus: text(100),
  serviceHistory: text(4000), modifications: text(4000), knownFlaws: text(4000),
});
export const initialListingDetails = draftDetailsSchema.parse({});
export const draftPayloadSchema = z.object({
  details: draftDetailsSchema,
  images: z.array(z.custom<string>(isCloudinaryImageUrl, { error: "Use uploaded listing photos." })).max(MAX_LISTING_PHOTOS),
  vehicleRecords: z.array(vehicleRecordSchema.extend({ label: z.string().max(100) })).max(MAX_VEHICLE_RECORDS),
  photoChecklist: z.array(checklistId).max(photoChecklistItems.length).transform((items) => [...new Set(items)]),
  step: z.number().int().min(0).max(3),
});
export const draftRevisionSchema = z.number().int().min(1).max(2147483647);
export const createDraftSchema = z.object({ id: listingIdSchema, saveKey: z.uuid(), payload: draftPayloadSchema });
export const updateDraftSchema = createDraftSchema.omit({ id: true }).extend({ revision: draftRevisionSchema });
export const publishDraftSchema = z.object({ draftId: listingIdSchema, revision: draftRevisionSchema });
export type DraftPayload = z.output<typeof draftPayloadSchema>;
export type ListingDraftDTO = {
  id: string;
  revision: number;
  updatedAt: string;
  payload: DraftPayload;
  publishedListingId: string | null;
};
export const emptyDraftPayload: DraftPayload = {
  details: initialListingDetails, images: [], vehicleRecords: [], photoChecklist: [], step: 0,
};
