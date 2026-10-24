import { z } from "zod";
import { listingIdSchema, requiredTextSchema, safeIntegerSchema } from "./common";

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
