import type { z } from "zod";
import type { registrationSchema } from "@/app/schemas/account";
import type { bidRequestSchema, commentRequestSchema } from "@/app/schemas/auction";
import type { listingSchema } from "@/app/schemas/listing";

export type AuthFormValues = z.input<typeof registrationSchema>;

// Native inputs keep these values as strings until listing validation parses them.
export type ListingDetailsFormValues = Record<Exclude<keyof z.input<typeof listingSchema>, "images" | "vehicleRecords">, string>;

export type BidFormValues = Pick<z.output<typeof bidRequestSchema>, "bidAmount">;

export type CommentFormValues = Pick<z.input<typeof commentRequestSchema>, "comment">;

export interface AuctionStartFormValues {
  endTime: string;
  startingBid: number;
  bidIncrement: number;
}
