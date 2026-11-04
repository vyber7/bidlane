import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ listing: vi.fn(), user: vi.fn(), comments: vi.fn(), bids: vi.fn(), live: vi.fn(), seller: vi.fn() }));
vi.mock("../../libs/prismadb", () => ({ default: { listing: { findUnique: mocks.listing }, user: { findUnique: mocks.seller } } }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/actions/getComments", () => ({ default: mocks.comments }));
vi.mock("@/app/actions/getBids", () => ({ default: mocks.bids }));
vi.mock("@/app/actions/getLiveAuctions", () => ({ default: mocks.live }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("./components/Comments", () => ({ default: () => null }));
vi.mock("./components/AuctionStatusBar", () => ({ default: () => <div>Public auction actions</div> }));
vi.mock("./components/MobileAuctionBar", () => ({ default: () => null }));
vi.mock("./components/AuctionStartForm", () => ({ default: () => null }));
vi.mock("./components/Bids", () => ({ default: () => null }));
vi.mock("./components/Gallery", () => ({ default: () => null }));
vi.mock("./components/CoverImage", () => ({ default: () => null }));
vi.mock("./components/ListingEditor", () => ({ default: () => null }));
vi.mock("@/app/submit-listing/components/Aside", () => ({ default: () => null }));
vi.mock("@/app/context/AuctionContext", () => ({ AuctionProvider: ({ children }: { children: ReactNode }) => children }));
import ListingPage from "./page";
const id = "abcdef0123456789abcdef01";
const visit = () => ListingPage({ params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
  mocks.user.mockResolvedValue(null);
  mocks.comments.mockResolvedValue([]); mocks.bids.mockResolvedValue([]); mocks.live.mockResolvedValue([]); mocks.seller.mockResolvedValue({ name: "Seller" });
});

describe("private listing pages", () => {
  it("shows review status instead of public auction and watchlist actions before approval", async () => {
    mocks.user.mockResolvedValue({ id: "seller" });
    const pending = renderToStaticMarkup(await visit());
    expect(pending).toContain("Awaiting review");
    expect(pending).not.toContain("Public auction actions");
    mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED" }));
    expect(renderToStaticMarkup(await visit())).toContain("Public auction actions");
  });

  it.each([null, { id: "buyer", role: "USER" }])("hides a pending listing from %j before fetching its activity", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(visit()).rejects.toThrow("not-found");
    expect(mocks.comments).not.toHaveBeenCalled(); expect(mocks.bids).not.toHaveBeenCalled(); expect(mocks.seller).not.toHaveBeenCalled();
  });
  it.each([{ id: "seller" }, { id: "moderator", role: "ADMIN" }])("allows private inspection by %j", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(visit()).resolves.toBeDefined();
  });
  it("lets anonymous visitors see an approved upcoming listing", async () => {
    mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED" }));
    await expect(visit()).resolves.toBeDefined();
  });
  it("excludes seller feedback from public page data while keeping it available to the seller", async () => {
    mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewNote: "Please redact your address." }));
    expect((await visit()).props.listing.reviewNote).toBeNull();
    mocks.user.mockResolvedValue({ id: "seller" });
    expect((await visit()).props.listing.reviewNote).toBe("Please redact your address.");
  });
});
