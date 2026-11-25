// The Review module's rules for who can see a Listing and when its Auction may
// start. Kept free of server and database dependencies so the database layer
// (prisma/native, prisma/reads) can use them; app code imports them from
// listing-review.

import { MongoAndExpr, MongoOrExpr, MongoFieldFilter as field } from "@prisma/orm-mongo/query-ast";
import type { Listing } from "@/app/types/database";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";

type ReviewableListing = Pick<Listing, "status" | "reviewStatus">;

// The visibility rule, written once. Once bidding has opened a Listing is
// public in every Review state; before that it is public only with Approval.
// Listings stored without a status read as Upcoming.
const openedStatuses: (string | null)[] = ["LIVE", "ENDED"];
const upcomingStatuses: (string | null)[] = ["UPCOMING", null];
const approved: ReviewStatus = "APPROVED";

/** An Upcoming Listing as a database filter, including Listings stored without a status. */
export function upcomingFilter() {
  return { status: { $in: upcomingStatuses } };
}

/** Approval: the Review decision that makes an Upcoming Listing public and lets its seller start the Auction. */
export function isApproved(listing: { reviewStatus: ReviewStatus | null }) {
  return listing.reviewStatus === approved;
}

/** The Approval requirement as a database filter, for guarded writes. */
export function approvedFilter() {
  return { reviewStatus: approved };
}

export function isPublicListing(listing: ReviewableListing) {
  return openedStatuses.includes(listing.status) ||
    (upcomingStatuses.includes(listing.status) && isApproved(listing));
}

/** isPublicListing as a database filter: `native` for driver queries, `read` for ORM reads. */
export const publicListingFilter = {
  native: () => ({
    $or: [
      { status: { $in: openedStatuses } },
      { ...upcomingFilter(), ...approvedFilter() },
    ],
  }),
  read: () => MongoOrExpr.of([
    field.in("status", openedStatuses),
    MongoAndExpr.of([field.in("status", upcomingStatuses), field.eq("reviewStatus", approved)]),
  ]),
};
