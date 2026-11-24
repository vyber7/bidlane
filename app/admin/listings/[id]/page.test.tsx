import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ review: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/app/libs/listing-moderation", () => ({ getListingReview: mocks.review }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
// Client islands are covered by their own tests; this page test checks the server-rendered summary.
vi.mock("@/app/listing/[id]/components/CoverImage", () => ({ default: () => null }));
vi.mock("@/app/listing/[id]/components/Gallery", () => ({ default: () => null }));
vi.mock("./ReviewForm", () => ({ default: () => null }));
import ReviewPage from "./page";

const id = "abcdef0123456789abcdef01";

function listingReview(overrides: Record<string, unknown> = {}) {
  return {
    id, year: 1995, make: "Porsche", model: "911", miles: 123456, location: "Austin, TX",
    vin: null, reservePrice: 1250000, description: "Clean car.", images: [], coverImage: null,
    status: "UPCOMING", reviewStatus: "PENDING", reviewRevision: 2, reviewNote: null, vehicleRecords: null,
    user: { name: "Seller", email: "seller@example.com" },
    reviews: [{ id: "r1", decision: "CHANGES_REQUESTED", reviewerName: "Admin", revision: 1, reason: null, createdAt: new Date("2026-11-24T23:30:00Z") }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
});

describe("admin listing review page", () => {
  it("formats mileage, reserve, and review history times for people", async () => {
    mocks.review.mockResolvedValue(listingReview());
    const html = renderToStaticMarkup(await ReviewPage({ params: Promise.resolve({ id }) }));
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("123,456 miles");
    expect(text).toContain("$1,250,000");
    expect(text).toContain("Nov 24, 2026, 11:30 PM UTC · Revision 1");
    expect(text).not.toContain("2026-11-24T23:30:00.000Z");
  });
});
