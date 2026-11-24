import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), notFound: vi.fn() }));
vi.mock("@/app/libs/seller-profile", () => ({ getSellerProfile: mocks.profile }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import SellerPage from "./page";

const id = "abcdef0123456789abcdef01";

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "fedcba9876543210fedcba98", year: 1995, make: "Porsche", model: "911", location: "Austin, TX", coverImage: null,
    status: "ENDED", result: "SOLD", startingBid: 10000, currentBid: 1250000, ...overrides,
  };
}

async function renderText(salesCount: number) {
  mocks.profile.mockResolvedValue({
    seller: { name: "Sam Seller", image: null, emailVerified: true, createdAt: new Date("2026-11-30T23:59:00Z") },
    salesCount,
    active: [],
    sales: [vehicle()],
  });
  const html = renderToStaticMarkup(await SellerPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
});

describe("seller profile", () => {
  it.each([
    [1, "1 vehicle sold at auction"],
    [1234, "1,234 vehicles sold at auction"],
  ])("counts %i sales as %s", async (salesCount, label) => {
    expect(await renderText(salesCount)).toContain(label);
  });

  it("formats membership month and sale prices", async () => {
    const text = await renderText(1);
    expect(text).toContain("Member since November 2026");
    expect(text).toContain("Sold for · $1,250,000");
  });
});
