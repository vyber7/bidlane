import { describe, expect, it } from "vitest";
import { vinSchema, vehicleRecordsSchema, readVehicleRecords } from "./vehicle-trust";
describe("seller-provided vehicle evidence", () => {
  it.each([" wp0ab2997ys123456 ", "BCNR33-012345", "ABC123", ""])("normalizes VIN/chassis input without claiming authenticity", (value) => {
    expect(vinSchema.parse(value)).toBe(value.trim().toUpperCase());
  });
  it.each(["bad\nnumber", "<script>", "a".repeat(31)])("rejects unsafe identifiers", (value) => { expect(vinSchema.safeParse(value).success).toBe(false); });
  it("supports legacy records missing from older listings", () => { expect(readVehicleRecords(null)).toEqual([]); expect(readVehicleRecords(undefined)).toEqual([]); });
  it.each(["pdf", "jpg", "jpeg", "png", "webp"])("accepts uploaded %s records", (ext) => {
    expect(vehicleRecordsSchema.safeParse([{ label: "Service history", url: `https://res.cloudinary.com/demo/image/upload/receipt.${ext}` }]).success).toBe(true);
  });
  it.each(["javascript:alert(1)", "https://example.com/receipt.pdf", "https://res.cloudinary.com.evil.example/image/upload/doc.pdf", "https://res.cloudinary.com/demo/image/upload/script.svg", "http://res.cloudinary.com/demo/image/upload/doc.pdf"])("rejects unsafe document links", (url) => {
    expect(vehicleRecordsSchema.safeParse([{ label: "Receipt", url }]).success).toBe(false);
  });
});
