// The Review module: Review decisions, the review queue, Review labels and
// the rule for who can see a Listing before Approval.

import type { z } from "zod";
import type { Listing } from "@/app/types/database";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";
import { authoringTransactionOptions } from "@/prisma/native/transaction-errors";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { requireAdmin } from "./admin";
import { ApiRequestError } from "./api-request";
import { auctionPhase } from "./auction-lifecycle";
import { isPublicListing } from "./listing-review-rules";

// The visibility rule and Approval requirement live in listing-review-rules,
// which has no server dependencies so the database layer can use them too.
export { approvedFilter, isApproved, isPublicListing, publicListingFilter } from "./listing-review-rules";

const refusals = {
  missing: "Listing not found.",
  notUpcoming: "Only upcoming listings can be reviewed.",
  stale: "This listing changed. Reload and review the latest version.",
} as const;

type ReviewableListing = Pick<Listing, "status" | "reviewStatus">;

export const reviewLabels = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
} as const;

export type ReviewLabel = (typeof reviewLabels)[keyof typeof reviewLabels];

// Listings submitted before Review existed have no review status; they are Awaiting review.
export function reviewLabel(listing: { reviewStatus: ReviewStatus | null }): ReviewLabel {
  return reviewLabels[listing.reviewStatus ?? "PENDING"];
}

export function canViewListing(listing: ReviewableListing & { userId: string }, user: { id: string; role?: string | null } | null) {
  return isPublicListing(listing) || Boolean(user && (listing.userId === user.id || user.role === "ADMIN"));
}

const reviewQueuePageSize = 20;

export async function getReviewQueue(page = 1, filter: ReviewStatus = "PENDING") {
  await requireAdmin();
  const listings = await getNativeRepositories().listingAuthoring.reviewQueue(page, filter);
  return { listings: listings.slice(0, reviewQueuePageSize), hasMore: listings.length > reviewQueuePageSize };
}

export async function getListingReview(id: string) {
  await requireAdmin();
  const repositories = getNativeRepositories();
  const [listing, auction] = await Promise.all([
    repositories.listingAuthoring.reviewDetail(id),
    repositories.auctions.find(id),
  ]);
  if (!listing || !auction) throw new ApiRequestError(404, refusals.missing);
  return { ...listing, phase: auctionPhase(auction, Date.now()).phase };
}

export async function reviewListing(id: string, input: z.output<typeof listingDecisionSchema>) {
  const admin = await requireAdmin();
  return withNativeTransaction(async (tx) => {
    const listing = await tx.listingAuthoring.find(id);
    if (!listing) throw new ApiRequestError(404, refusals.missing);
    if (listing.status !== "UPCOMING") throw new ApiRequestError(409, refusals.notUpcoming);
    if ((listing.reviewRevision ?? 0) !== input.revision) throw new ApiRequestError(409, refusals.stale);
    const now = new Date();
    const updated = await tx.listingAuthoring.setReview(id, input, now);
    if (updated.count !== 1) throw new ApiRequestError(409, refusals.stale);
    await tx.listingAuthoring.addReview(id, input, { id: admin.id, name: admin.name }, now);
    return { reviewStatus: input.decision, reviewRevision: input.revision + 1 };
  }, authoringTransactionOptions);
}
