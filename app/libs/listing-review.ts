// The Review module: Review decisions, the review queue, Review labels and
// the rule for who can see a Listing before Approval.

import type { z } from "@/app/schemas/zod";
import type { Listing } from "@/app/types/database";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";
import { authoringTransactionOptions, isTransactionContention } from "@/prisma/native/transaction-errors";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { requireAdmin } from "./admin";
import { ApiRequestError } from "./api-request";
import { auctionPhase } from "./auction-lifecycle";
import { isPublicListing } from "./listing-review-rules";
import { listingCapabilities } from "./listing-capabilities";

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
  const admin = await requireAdmin();
  const repositories = getNativeRepositories();
  const [listing, auction] = await Promise.all([
    repositories.listingAuthoring.reviewDetail(id),
    repositories.auctions.find(id),
  ]);
  if (!listing || !auction) throw new ApiRequestError(404, refusals.missing);
  const now = Date.now();
  return { ...listing, phase: auctionPhase(auction, now).phase, canReview: listingCapabilities(auction, admin, now).review.allowed };
}

// Transaction contention means another change reached the Listing first, so
// the administrator gets the same reload refusal as for a stale revision.
export async function reviewListing(id: string, input: z.output<typeof listingDecisionSchema>) {
  const admin = await requireAdmin();
  try {
    return await recordDecision(admin, id, input);
  } catch (error) {
    if (isTransactionContention(error)) throw new ApiRequestError(409, refusals.stale);
    throw error;
  }
}

function recordDecision(admin: Awaited<ReturnType<typeof requireAdmin>>, id: string, input: z.output<typeof listingDecisionSchema>) {
  return withNativeTransaction(async (tx) => {
    const now = new Date();
    const listing = await tx.listingAuthoring.find(id);
    if (!listing) throw new ApiRequestError(404, refusals.missing);
    if (!listingCapabilities(listing, admin, now.getTime()).review.allowed) throw new ApiRequestError(409, refusals.notUpcoming);
    if (listing.reviewRevision !== input.revision) throw new ApiRequestError(409, refusals.stale);
    const updated = await tx.listingAuthoring.setReview(id, input, now);
    if (updated.count !== 1) throw new ApiRequestError(409, refusals.stale);
    await tx.listingAuthoring.addReview(id, input, { id: admin.id, name: admin.name }, now);
    return { reviewStatus: input.decision, reviewRevision: input.revision + 1 };
  }, authoringTransactionOptions);
}
