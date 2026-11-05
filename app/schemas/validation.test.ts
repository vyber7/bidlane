import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiErrorResponse, parseApiInput } from "@/app/libs/api-request";
import { registrationSchema, profileSchema } from "./account";
import { bidRequestSchema, commentRequestSchema } from "./auction";
import { listingSchema } from "./listing";

const listingId = "abcdef0123456789abcdef01";
const listing = {
  make: " Porsche ", model: "911", year: "2020", miles: "0", reservePrice: "",
  location: " Miami ", description: " Maintained regularly ",
  transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean",
  serviceHistory: " Records available ", modifications: "None known", knownFlaws: "None known",
  images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"],
};

afterEach(() => vi.useRealTimers());

describe("shared validation boundaries", () => {
  it.each([["make", 100], ["model", 100], ["location", 200], ["description", 10000]] as const)("bounds listing %s consistently with drafts", (field, limit) => {
    expect(listingSchema.safeParse({ ...listing, [field]: "x".repeat(limit) }).success).toBe(true);
    expect(listingSchema.safeParse({ ...listing, [field]: "x".repeat(limit + 1) }).success).toBe(false);
  });
  it("bounds registration and comment fields before expensive work", () => {
    const account = { name: "Driver", email: "driver@example.com", password: "password" };
    expect(registrationSchema.safeParse({ ...account, name: "x".repeat(61) }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...account, password: "é".repeat(513) }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...account, password: "é".repeat(512) }).success).toBe(true);
    expect(commentRequestSchema.safeParse({ listingId, comment: "x".repeat(4000) }).success).toBe(true);
    expect(commentRequestSchema.safeParse({ listingId, comment: "x".repeat(4001) }).success).toBe(false);
  });
  it("accepts a 20-photo listing and rejects a 21st photo", () => {
    const images = Array.from({ length: 20 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/photo-${i}.jpg`);
    expect(listingSchema.parse({ ...listing, images }).images).toHaveLength(20);
    expect(listingSchema.safeParse({ ...listing, images: [...images, "https://res.cloudinary.com/demo/image/upload/extra.jpg"] }).success).toBe(false);
  });
  it("parses native listing input, trims text, and excludes server-owned fields", () => {
    const parsed = listingSchema.parse({ ...listing, userId: "another-seller", status: "LIVE" });
    expect(parsed).toMatchObject({ make: "Porsche", location: "Miami", description: "Maintained regularly", year: 2020, miles: 0, reservePrice: null, serviceHistory: "Records available" });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("status");
  });

  it.each(["", null, undefined])("normalizes an absent reserve (%j) to null", (reservePrice) => {
    expect(listingSchema.parse({ ...listing, reservePrice }).reservePrice).toBeNull();
  });

  it.each([false, true, null, "", " ", [], {}, "1.5", -1, 2_147_483_648])(
    "rejects a malformed mileage (%j) rather than coercing it", (miles) => {
      const result = listingSchema.safeParse({ ...listing, miles });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["miles"], message: "Please enter a valid miles." });
    },
  );

  it("distinguishes a blank reserve from whitespace and keeps numeric zero", () => {
    expect(listingSchema.safeParse({ ...listing, reservePrice: " " }).success).toBe(false);
    expect(listingSchema.parse({ ...listing, reservePrice: "0" }).reservePrice).toBe(0);
  });

  it("uses the current year at validation time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T12:00:00Z"));
    expect(listingSchema.safeParse({ ...listing, year: "2028" }).success).toBe(false);
    vi.setSystemTime(new Date("2027-01-01T12:00:00Z"));
    expect(listingSchema.parse({ ...listing, year: "2028" }).year).toBe(2028);
  });

  it.each([false, null, "", " ", [], {}, 0, 1.5, 2_147_483_648])(
    "rejects malformed bid amounts (%j)", (bidAmount) => {
      expect(bidRequestSchema.safeParse({ listingId, bidAmount }).success).toBe(false);
    },
  );

  it("accepts numeric bid strings at the API boundary and returns numbers", () => {
    expect(bidRequestSchema.parse({ listingId, bidAmount: "1000" })).toEqual({ listingId, bidAmount: 1000 });
  });

  it.each([" ", null, 123])("rejects empty or non-string comments (%j)", (comment) => {
    expect(commentRequestSchema.safeParse({ listingId, comment }).success).toBe(false);
  });

  it("trims comment text and preserves the optional image behavior", () => {
    expect(commentRequestSchema.parse({ listingId, comment: " Great car ", image: null })).toEqual({ listingId, comment: "Great car", image: undefined });
  });

  it("trims registration details while preserving password whitespace", () => {
    expect(registrationSchema.parse({ name: " Driver ", email: " Driver@example.com ", password: " secret " })).toEqual({ name: "Driver", email: "Driver@example.com", password: " secret " });
  });

  it("keeps existing JavaScript length limits for profile names", () => {
    expect(profileSchema.safeParse({ name: "😀".repeat(31), image: "" }).success).toBe(false);
  });

  it("converts request validation into the existing error envelope", async () => {
    let error: unknown;
    try {
      parseApiInput(bidRequestSchema, { listingId: "bad", bidAmount: 1000 });
    } catch (caught) {
      error = caught;
    }
    const response = apiErrorResponse(error);
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({ error: "Invalid listing ID" });
    expect(apiErrorResponse(new z.ZodError([]))).toBeNull();
  });
});
