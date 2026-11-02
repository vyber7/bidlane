import { z } from "zod";
import { listingIdSchema, requiredTextSchema, safeIntegerSchema } from "./common";

export const bidIdempotencyKeySchema = z.string({ error: "A valid Idempotency-Key header is required" })
  .regex(/^[a-zA-Z0-9_-]{16,128}$/, "Idempotency-Key must contain 16–128 letters, digits, underscores, or hyphens");

export const bidRequestSchema = z.object({
  listingId: listingIdSchema,
  bidAmount: safeIntegerSchema("Bid amount"),
});

export const commentRequestSchema = z.object({
  listingId: listingIdSchema,
  comment: requiredTextSchema("Comment is required"),
  // Preserve the existing API's treatment of non-string images as absent.
  image: z.preprocess((value) => typeof value === "string" ? value : undefined, z.string().optional()),
});
