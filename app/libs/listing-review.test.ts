import { describe, expect, it } from "vitest";
import { canViewListing, isPublicListing } from "./listing-review";
import { toPublicListing } from "./listing-payload";
import { makeListing } from "@/app/test/auction-fixtures";

describe("listing review visibility and legacy data", () => {
  it("does not include seller feedback in public listing payloads", () => {
    const listing = makeListing({ reviewNote: "Please redact the address from this receipt." });
    expect(toPublicListing(listing)).not.toHaveProperty("reviewNote");
    expect(listing.reviewNote).not.toBeNull();
  });

  it.each(["LIVE", "ENDED"])("keeps existing %s auctions public without approval", (status) => {
    expect(isPublicListing(makeListing({ status, reviewStatus: null }))).toBe(true);
  });
  it.each([null, "PENDING", "CHANGES_REQUESTED"] as const)("hides upcoming listings with review status %s", (reviewStatus) => {
    const listing = makeListing({ status: "UPCOMING", reviewStatus });
    expect(canViewListing(listing, null)).toBe(false);
    expect(canViewListing(listing, { id: "buyer", role: "USER" })).toBe(false);
    expect(canViewListing(listing, { id: "seller" })).toBe(true);
    expect(canViewListing(listing, { id: "admin", role: "ADMIN" })).toBe(true);
  });
  it("makes only approved upcoming listings public", () => {
    expect(isPublicListing(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED" }))).toBe(true);
  });
});
