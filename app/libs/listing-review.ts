import type { Listing } from "@/app/types/database";

type ReviewableListing = Pick<Listing, "status" | "reviewStatus">;

export const reviewLabels = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
} as const;

export function isPublicListing(listing: ReviewableListing) {
  return listing.status === "LIVE" || listing.status === "ENDED" ||
    (listing.status === "UPCOMING" && listing.reviewStatus === "APPROVED");
}

export function canViewListing(listing: ReviewableListing & { userId: string }, user: { id: string; role?: string | null } | null) {
  return isPublicListing(listing) || Boolean(user && (listing.userId === user.id || user.role === "ADMIN"));
}
