import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { makeListing } from "@/app/test/auction-fixtures";
import { toPublicListing, type PublicListing, type SellerListing } from "./listing-payload";

const mocks = vi.hoisted(() => ({ find: vi.fn(), watchlist: vi.fn(), user: vi.fn(), drafts: vi.fn(), browser: vi.fn(), featured: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => ({ drafts: { list: mocks.drafts }, engagement: { watchlist: mocks.watchlist } }),
  withNativeTransaction: () => { throw new Error("Unexpected native transaction in this test"); },
}));
vi.mock("@/app/libs/read-repositories", () => ({ getReadRepositories: () => ({ listings: { public: mocks.find, live: mocks.find, sold: mocks.find, owned: mocks.find } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/account/lib/current-user", () => ({ getAccountUser: mocks.user }));
vi.mock("@/app/(site)/components/AuctionBrowser", () => ({ default: ({ listings }: { listings: PublicListing[] }) => { mocks.browser(listings); return null; } }));
vi.mock("@/app/(site)/components/FeaturedAuction", () => ({ default: ({ listing }: { listing: PublicListing }) => { mocks.featured(listing); return null; } }));
vi.mock("@/app/account/components/ListingDrafts", () => ({ default: () => null }));
vi.mock("@/app/account/components/ListingsDashboard", () => ({ default: (props: { uploaded: SellerListing[]; initialWatching: PublicListing[] }) => { mocks.dashboard(props); return null; } }));
import Home from "@/app/(site)/page";
import AccountListings from "@/app/account/listings/page";
import getLiveAuctions from "@/app/actions/getLiveAuctions";
import getSoldAuctions from "@/app/actions/getSoldAuctions";

const privateKeys = ["reservePrice", "watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "reviewNote", "reviewStatus", "reviewRevision", "endingSoonReminderAt", "futureSecret"];
const record = (userId = "seller") => ({ ...makeListing({ userId, status: "UPCOMING", reviewStatus: "APPROVED", reservePrice: 98765, watchersIds: ["buyer", "other-watcher"], seenIds: ["private-viewer"], reviewNote: "Private feedback" }), futureSecret: "secret" });
const expectPublic = (listing: PublicListing) => {
  for (const field of privateKeys) expect(listing).not.toHaveProperty(field);
  expect(listing).toMatchObject({ isNoReserve: false, watcherCount: 2 });
};

beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue([record()]); mocks.watchlist.mockResolvedValue([toPublicListing(record(), "buyer")]); mocks.user.mockResolvedValue({ id: "buyer" }); mocks.drafts.mockResolvedValue([]); });

describe("server-to-client listing boundaries", () => {
  it.each([null, { id: "buyer" }])("projects every homepage client payload for viewer %j", async (viewer) => {
    mocks.user.mockResolvedValue(viewer);
    renderToStaticMarkup(await Home());
    const browser = mocks.browser.mock.calls[0][0];
    const featured = mocks.featured.mock.calls[0][0];
    expectPublic(browser[0]); expectPublic(featured);
    expect(browser[0].isWatching).toBe(Boolean(viewer));
  });

  it.each([["live", getLiveAuctions], ["sold", getSoldAuctions]] as const)("projects %s sidebar records", async (_name, getAuctions) => {
    const records = await getAuctions();
    expect(records).toHaveLength(1);
    expectPublic(records[0]);
    expect(records[0].isWatching).toBe(false);
  });

  it("limits watched listings to public fields and uploaded listings to authorized management fields", async () => {
    mocks.find.mockResolvedValueOnce([record("buyer")]);
    renderToStaticMarkup(await AccountListings());
    const { uploaded, initialWatching } = mocks.dashboard.mock.calls[0][0];
    expectPublic(initialWatching[0]);
    expect(initialWatching[0].isWatching).toBe(true);
    expect(mocks.watchlist).toHaveBeenCalledWith("buyer");
    expect(uploaded[0]).toMatchObject({ reservePrice: 98765, reviewNote: "Private feedback" });
    for (const field of ["watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "futureSecret"]) expect(uploaded[0]).not.toHaveProperty(field);
  });
});
