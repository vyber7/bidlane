import type { z } from "zod";
import type { ListingReviewStatus } from "@prisma/client";
import prisma from "./prismadb";
import { requireAdmin } from "./admin";
import { ApiRequestError } from "./api-request";
import { reviewVersionWhere } from "./listing-review";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";

export async function getReviewQueue(page = 1, filter: ListingReviewStatus = "PENDING") {
  await requireAdmin();
  const listings = await prisma.listing.findMany({
    where: { status: "UPCOMING", ...(filter === "PENDING"
      ? { OR: [{ reviewStatus: "PENDING" as const }, { reviewStatus: null }, { reviewStatus: { isSet: false } }] }
      : { reviewStatus: filter }) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * 20, take: 21,
    select: { id: true, year: true, make: true, model: true, createdAt: true, reviewStatus: true, reviewNote: true, user: { select: { name: true } } },
  });
  return { listings: listings.slice(0, 20), hasMore: listings.length > 20 };
}

export async function getListingReview(id: string) {
  await requireAdmin();
  const listing = await prisma.listing.findUnique({ where: { id }, include: {
    user: { select: { name: true, email: true } },
    reviews: { orderBy: { createdAt: "desc" }, take: 50 },
  } });
  if (!listing) throw new ApiRequestError(404, "Listing not found.");
  return listing;
}

export async function reviewListing(id: string, input: z.output<typeof listingDecisionSchema>) {
  const admin = await requireAdmin();
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id } });
    if (!listing) throw new ApiRequestError(404, "Listing not found.");
    if (listing.status !== "UPCOMING") throw new ApiRequestError(409, "Only upcoming listings can be reviewed.");
    if ((listing.reviewRevision ?? 0) !== input.revision) throw new ApiRequestError(409, "This listing changed. Reload and review the latest version.");
    const revision = input.revision + 1;
    const updated = await tx.listing.updateMany({
      where: { id, status: "UPCOMING", ...reviewVersionWhere(input.revision) },
      data: { reviewStatus: input.decision, reviewNote: input.reason || null, reviewRevision: revision },
    });
    if (updated.count !== 1) throw new ApiRequestError(409, "This listing changed. Reload and review the latest version.");
    await tx.listingReview.create({ data: {
      listingId: id, reviewerId: admin.id, reviewerName: admin.name || "Admin",
      decision: input.decision, reason: input.reason || null, revision,
    } });
    return { reviewStatus: input.decision, reviewRevision: revision };
  });
}
