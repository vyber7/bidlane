import { z } from "zod";

export const reviewRevisionSchema = z.number().int().min(0).max(2_147_483_646);
export const listingDecisionSchema = z.object({
  revision: reviewRevisionSchema,
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  reason: z.string().trim().max(2000).default(""),
}).refine((value) => value.decision !== "CHANGES_REQUESTED" || value.reason.length > 0, {
  message: "Explain what the seller needs to change.", path: ["reason"],
});
