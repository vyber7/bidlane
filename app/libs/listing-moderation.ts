import type { z } from "zod";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";
import { authoringTransactionOptions } from "@/prisma/native/transaction-errors";
import { getNativeRepositories, withNativeTransaction } from "./native-repositories";
import { requireAdmin } from "./admin";
import { ApiRequestError } from "./api-request";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";
import { auctionPhase } from "./auction-lifecycle";

export async function getReviewQueue(page = 1, filter: ReviewStatus = "PENDING") {
  await requireAdmin();
  const listings = await getNativeRepositories().listingAuthoring.reviewQueue(page, filter);
  return { listings: listings.slice(0, 20), hasMore: listings.length > 20 };
}

export async function getListingReview(id: string) {
  await requireAdmin();
  const repositories = getNativeRepositories();
  const [listing, auction] = await Promise.all([
    repositories.listingAuthoring.reviewDetail(id),
    repositories.auctions.find(id),
  ]);
  if (!listing || !auction) throw new ApiRequestError(404, "Listing not found.");
  return { ...listing, phase: auctionPhase(auction, Date.now()).phase };
}

export async function reviewListing(id: string, input: z.output<typeof listingDecisionSchema>) {
  const admin = await requireAdmin();
  return withNativeTransaction(async (tx) => {
    const listing = await tx.listingAuthoring.find(id);
    if (!listing) throw new ApiRequestError(404, "Listing not found.");
    if (listing.status !== "UPCOMING") throw new ApiRequestError(409, "Only upcoming listings can be reviewed.");
    if ((listing.reviewRevision ?? 0) !== input.revision) throw new ApiRequestError(409, "This listing changed. Reload and review the latest version.");
    const revision = input.revision + 1;
    const now = new Date();
    const updated = await tx.listingAuthoring.setReview(id, input, now);
    if (updated.count !== 1) throw new ApiRequestError(409, "This listing changed. Reload and review the latest version.");
    await tx.listingAuthoring.addReview(id, input, { id: admin.id, name: admin.name }, now);
    return { reviewStatus: input.decision, reviewRevision: revision };
  }, authoringTransactionOptions);
}
