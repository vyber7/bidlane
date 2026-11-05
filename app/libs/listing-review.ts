import type { Listing, Prisma } from "@prisma/client";

type ReviewableListing = Pick<Listing, "status" | "reviewStatus">;

export const reviewLabels = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
} as const;

// Live auctions and their results predate review and remain accessible.
export const publicListingWhere: Prisma.ListingWhereInput = {
  OR: [{ status: { in: ["LIVE", "ENDED"] } }, { status: "UPCOMING", reviewStatus: "APPROVED" }],
};

export function isPublicListing(listing: ReviewableListing) {
  return listing.status === "LIVE" || listing.status === "ENDED" ||
    (listing.status === "UPCOMING" && listing.reviewStatus === "APPROVED");
}

export function canViewListing(listing: ReviewableListing & { userId: string }, user: { id: string; role?: string | null } | null) {
  return isPublicListing(listing) || Boolean(user && (listing.userId === user.id || user.role === "ADMIN"));
}

// MongoDB distinguishes missing fields from null and zero, even when Prisma
// supplies a default on read. Legacy upcoming listings start at revision zero.
export function reviewVersionWhere(revision: number): Prisma.ListingWhereInput {
  return revision === 0
    ? { OR: [{ reviewRevision: 0 }, { reviewRevision: null }, { reviewRevision: { isSet: false } }] }
    : { reviewRevision: revision };
}

export function pendingReviewUpdate(revision: number) {
  return { reviewStatus: "PENDING" as const, reviewRevision: revision + 1, reviewNote: null };
}
