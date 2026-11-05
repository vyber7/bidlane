import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ listing: vi.fn(), user: vi.fn(), comments: vi.fn(), bids: vi.fn(), live: vi.fn(), seller: vi.fn(), editor: vi.fn() }));
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
vi.mock("./components/ListingEditor", () => ({ default: ({ listing }: { listing: unknown }) => { mocks.editor(listing); return null; } }));
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
  it("never passes reserve amounts or private activity lists into the auction provider", async () => {
    mocks.listing.mockResolvedValue(makeListing({
      status: "LIVE", reservePrice: 98765, watchersIds: ["private-watcher"], seenIds: ["private-viewer"],
      biddersIds: ["private-bidder"], commenterIds: ["private-commenter"], reviewNote: "Private review feedback",
    }));
    const payload = (await visit()).props.listing;
    for (const field of ["reservePrice", "watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "reviewNote", "endingSoonReminderAt"]) {
      expect(payload).not.toHaveProperty(field);
    }
    expect(payload).toMatchObject({ isNoReserve: false, watcherCount: 1, isWatching: false });
  });

  it("keeps seller correction fields separate from the public provider without exposing activity lists", async () => {
    mocks.user.mockResolvedValue({ id: "seller" });
    mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "CHANGES_REQUESTED", reviewRevision: 3, reservePrice: 98765, reviewNote: "Private feedback", watchersIds: ["private-watcher"], seenIds: ["private-viewer"] }));
    const page = await visit();
    expect(page.props.listing).not.toHaveProperty("reservePrice");
    renderToStaticMarkup(page);
    const editor = mocks.editor.mock.calls[0][0];
    expect(editor).toMatchObject({ reservePrice: 98765, reviewNote: "Private feedback", reviewRevision: 3 });
    expect(editor).not.toHaveProperty("watchersIds");
    expect(editor).not.toHaveProperty("seenIds");
  });

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
  it("excludes seller feedback from the shared provider even on the seller's page", async () => {
    mocks.listing.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewNote: "Please redact your address." }));
    expect((await visit()).props.listing).not.toHaveProperty("reviewNote");
    mocks.user.mockResolvedValue({ id: "seller" });
    expect((await visit()).props.listing).not.toHaveProperty("reviewNote");
    expect(renderToStaticMarkup(await visit())).toContain("Please redact your address.");
  });
});
