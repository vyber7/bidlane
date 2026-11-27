import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "@/app/schemas/zod";
import { makeListing } from "@/app/test/auction-fixtures";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";
import type { listingDecisionSchema } from "@/app/schemas/listing-review";

type StoredListing = { id: string; userId: string; status: string; reviewStatus: ReviewStatus | null; reviewNote: string | null; reviewRevision: number; createdAt: number };
type Decision = z.output<typeof listingDecisionSchema>;
const store = vi.hoisted(() => ({
  user: null as { id: string; name?: string; role?: string } | null,
  listings: new Map<string, StoredListing>(),
  reviews: [] as { listingId: string; decision: string; reviewer: string }[],
  auctions: new Map<string, Record<string, unknown>>(),
  beforeSave: undefined as (() => void) | undefined,
  transactionError: undefined as unknown,
}));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: async () => store.user }));
const fakeRepositories = vi.hoisted(() => () => ({
  listingAuthoring: {
    find: async (id: string) => structuredClone(store.listings.get(id) ?? null),
    // Mirrors the guarded save: only an Upcoming Listing at the loaded revision changes.
    setReview: async (id: string, input: Decision) => {
      store.beforeSave?.();
      const listing = store.listings.get(id);
      if (!listing || listing.status !== "UPCOMING" || listing.reviewRevision !== input.revision) return { count: 0 };
      store.listings.set(id, { ...listing, reviewStatus: input.decision, reviewNote: input.reason || null, reviewRevision: input.revision + 1 });
      return { count: 1 };
    },
    addReview: async (listingId: string, input: Decision, reviewer: { id: string }) => {
      store.reviews.push({ listingId, decision: input.decision, reviewer: reviewer.id });
    },
    // Mirrors the queue: Upcoming Listings in one Review state, oldest first, 21 per page to detect more.
    reviewQueue: async (page: number, filter: string) => [...store.listings.values()]
      .filter((listing) => listing.status === "UPCOMING" && (listing.reviewStatus ?? "PENDING") === filter)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice((page - 1) * 20, page * 20 + 1),
    reviewDetail: async (id: string) => {
      const listing = store.listings.get(id);
      return listing ? { ...structuredClone(listing), reviews: store.reviews.filter((review) => review.listingId === id) } : null;
    },
  },
  auctions: {
    find: async (id: string) => {
      const listing = store.listings.get(id);
      return listing ? { status: listing.status, result: null, auctionStartsAt: null, auctionEndsAt: null, startingBid: 10000, currentBid: null, bidIncrement: 500, highestBidderId: null, ...store.auctions.get(id) } : null;
    },
  },
}));
vi.mock("./native-repositories", () => ({
  getNativeRepositories: fakeRepositories,
  withNativeTransaction: async (operation: (repositories: ReturnType<typeof fakeRepositories>) => unknown) => {
    if (store.transactionError) throw store.transactionError;
    return operation(fakeRepositories());
  },
}));
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";
import { canViewListing, getListingReview, getReviewQueue, isPublicListing, reviewLabel, reviewListing } from "./listing-review";

const listingId = "abcdef0123456789abcdef01";
const admin = { id: "admin", name: "Reviewer", role: "ADMIN" };
const stored = (overrides: Partial<StoredListing> = {}): StoredListing => ({ id: listingId, userId: "seller", status: "UPCOMING", reviewStatus: "PENDING", reviewNote: null, reviewRevision: 3, createdAt: 0, ...overrides });
const listing = () => store.listings.get(listingId)!;

beforeEach(() => {
  store.user = admin;
  store.listings.clear(); store.auctions.clear(); store.reviews = []; store.beforeSave = undefined; store.transactionError = undefined;
  store.listings.set(listingId, stored());
});

const approve = (revision = 3) => reviewListing(listingId, { revision, decision: "APPROVED", reason: "" });
const requestChanges = (reason: string) => reviewListing(listingId, { revision: 3, decision: "CHANGES_REQUESTED", reason });
const buyer = { id: "buyer", role: "USER" };

describe("a Review decision", () => {
  it("makes an Approved Upcoming Listing public and records who decided", async () => {
    expect(await approve()).toEqual({ reviewStatus: "APPROVED", reviewRevision: 4 });
    expect(isPublicListing(listing())).toBe(true);
    expect(store.reviews).toEqual([{ listingId, decision: "APPROVED", reviewer: "admin" }]);
  });
  it("keeps a Listing with Changes requested hidden from the public but visible to its seller and administrators", async () => {
    await requestChanges("Please redact the address from this receipt.");
    expect(listing()).toMatchObject({ reviewStatus: "CHANGES_REQUESTED", reviewNote: "Please redact the address from this receipt." });
    expect(canViewListing(listing(), null)).toBe(false);
    expect(canViewListing(listing(), buyer)).toBe(false);
    expect(canViewListing(listing(), { id: "seller" })).toBe(true);
    expect(canViewListing(listing(), admin)).toBe(true);
  });
  it("refuses a Listing whose bidding has opened, because only Upcoming Listings can be reviewed", async () => {
    store.listings.set(listingId, stored({ status: "LIVE" }));
    await expect(approve()).rejects.toMatchObject({ status: 409, message: "Only upcoming listings can be reviewed." });
    expect(store.reviews).toEqual([]);
  });
  it("refuses a Listing that changes while the decision is being saved", async () => {
    store.beforeSave = () => store.listings.set(listingId, stored({ reviewRevision: 4 }));
    await expect(approve()).rejects.toMatchObject({ status: 409, message: "This listing changed. Reload and review the latest version." });
    expect(store.reviews).toEqual([]);
  });
  it("asks the administrator to reload when the decision meets transaction contention", async () => {
    store.transactionError = new TransactionRetryLimitError();
    await expect(approve()).rejects.toMatchObject({ status: 409, message: "This listing changed. Reload and review the latest version." });
    expect(store.reviews).toEqual([]);
  });
  it("refuses a missing Listing", async () => {
    store.listings.clear();
    await expect(approve()).rejects.toMatchObject({ status: 404 });
  });
  it("refuses a Listing that changed since the administrator opened it", async () => {
    await expect(reviewListing(listingId, { revision: 2, decision: "APPROVED", reason: "" }))
      .rejects.toMatchObject({ status: 409, message: "This listing changed. Reload and review the latest version." });
    expect(listing().reviewStatus).toBe("PENDING");
    expect(store.reviews).toEqual([]);
  });
});

describe("the review queue", () => {
  it.each([[null, 401], [buyer, 403]] as const)("is only for administrators (%j gets %i)", async (user, status) => {
    store.user = user;
    await expect(getReviewQueue()).rejects.toHaveProperty("status", status);
    await expect(getListingReview(listingId)).rejects.toHaveProperty("status", status);
    await expect(approve()).rejects.toHaveProperty("status", status);
    expect(listing().reviewStatus).toBe("PENDING");
  });
  it("lists Listings Awaiting review oldest first, 20 per page, including legacy Listings without a review status", async () => {
    store.listings.clear();
    for (let index = 0; index < 22; index++) {
      const id = `listing-${index}`;
      store.listings.set(id, stored({ id, createdAt: 22 - index, reviewStatus: index === 0 ? null : "PENDING" }));
    }
    store.listings.set("approved", stored({ id: "approved", reviewStatus: "APPROVED" }));
    const first = await getReviewQueue();
    expect(first.hasMore).toBe(true);
    expect(first.listings).toHaveLength(20);
    expect(first.listings[0].id).toBe("listing-21");
    const second = await getReviewQueue(2);
    expect(second).toMatchObject({ hasMore: false, listings: [{ id: "listing-1" }, { id: "listing-0" }] });
  });
  it("lets administrators revisit Approved Listings to request changes", async () => {
    store.listings.set("approved", stored({ id: "approved", reviewStatus: "APPROVED" }));
    expect((await getReviewQueue(1, "APPROVED")).listings.map(({ id }) => id)).toEqual(["approved"]);
  });
});

describe("a Listing's Review detail", () => {
  it("includes its Review history", async () => {
    await approve();
    expect(await getListingReview(listingId)).toMatchObject({ id: listingId, reviews: [{ decision: "APPROVED", reviewer: "admin" }] });
  });
  it.each([
    [{ status: "UPCOMING" }, "upcoming"],
    [{ status: "LIVE", auctionStartsAt: new Date(Date.now() - 60_000), auctionEndsAt: new Date(Date.now() + 60_000) }, "open"],
    [{ status: "LIVE", auctionStartsAt: new Date(Date.now() - 60_000), auctionEndsAt: new Date(Date.now() - 1_000) }, "closing"],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000 }, "sold"],
    [{ status: "ENDED", result: "RESERVE_NOT_MET" }, "unsold"],
  ])("reports the Auction phase for %j", async (auction, phase) => {
    store.auctions.set(listingId, auction);
    expect(await getListingReview(listingId)).toHaveProperty("phase", phase);
  });
  it("is not found for a missing Listing", async () => {
    await expect(getListingReview("missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("Review labels", () => {
  it.each([[null, "Awaiting review"], ["PENDING", "Awaiting review"], ["APPROVED", "Approved"], ["CHANGES_REQUESTED", "Changes requested"]] as const)("labels %s as %s", (reviewStatus, label) => {
    expect(reviewLabel({ reviewStatus })).toBe(label);
  });
});

describe("who can see a Listing", () => {
  it.each(["LIVE", "ENDED"])("keeps %s Auctions public without Approval", (status) => {
    expect(isPublicListing(makeListing({ status, reviewStatus: null }))).toBe(true);
  });
  it.each([null, "PENDING", "CHANGES_REQUESTED"] as const)("hides Upcoming Listings with review status %s from the public", (reviewStatus) => {
    const upcoming = makeListing({ status: "UPCOMING", reviewStatus });
    expect(canViewListing(upcoming, null)).toBe(false);
    expect(canViewListing(upcoming, { id: "buyer", role: "USER" })).toBe(false);
    expect(canViewListing(upcoming, { id: "seller" })).toBe(true);
    expect(canViewListing(upcoming, { id: "admin", role: "ADMIN" })).toBe(true);
  });
  it("makes only Approved Upcoming Listings public", () => {
    expect(isPublicListing(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED" }))).toBe(true);
  });
});
