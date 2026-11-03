import { z } from "zod";

export const vinSchema = z.string().trim().toUpperCase().max(30, "VIN or chassis number must be 30 characters or fewer.")
  .refine((value) => !value || /^[A-Z0-9-]{3,30}$/.test(value), "Enter a VIN or chassis number using letters, numbers, and hyphens.");

export const MAX_VEHICLE_RECORDS = 10;
export const vehicleRecordSchema = z.object({
  label: z.string().trim().min(1, "Name this record.").max(100, "Record names must be 100 characters or fewer."),
  url: z.string().max(2048).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !url.username && !url.password &&
        url.pathname.includes("/image/upload/") && /\.(pdf|jpe?g|png|webp)$/i.test(url.pathname);
    } catch { return false; }
  }, "Upload a PDF, JPG, PNG, or WebP vehicle record."),
});
export const vehicleRecordsSchema = z.array(vehicleRecordSchema).max(MAX_VEHICLE_RECORDS);
export type VehicleRecord = z.output<typeof vehicleRecordSchema>;

export function readVehicleRecords(value: unknown): VehicleRecord[] {
  const result = vehicleRecordsSchema.safeParse(value);
  return result.success ? result.data : [];
}
