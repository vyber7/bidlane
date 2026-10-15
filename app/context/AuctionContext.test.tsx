// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuctionProvider } from "./AuctionContext";
import AuctionStatusBar from "@/app/listing/[id]/components/AuctionStatusBar";
import Bids from "@/app/listing/[id]/components/Bids";
import Comments from "@/app/listing/[id]/components/Comments";
import AccountListingBox from "@/app/account/components/AccountListingBox";
import ListingsDashboard from "@/app/account/components/ListingsDashboard";
import ListingBox from "@/app/components/ListingBox";
import { auctionNow, makeBid, makeComment, makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { name: "Buyer" } } }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));
vi.mock("@/app/hooks/useWatchlist", () => ({
  default: () => ({ watching: false, isUpdating: false, toggle: vi.fn() }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("shared auction views", () => {
  it("updates the overview, bidding form, clock, and activity from a successful bid without Pusher", async () => {
    const listing = makeListing();
    const bid = makeBid();
    const end = new Date(Date.now() + 120000).toISOString();
    mocks.post.mockImplementation((url) => Promise.resolve({
      data: url === "/api/place-bid" ? { bid, currentBid: bid.amount, auctionEndsAt: end } : {},
    }));
    render(
      <AuctionProvider listing={listing} bids={[]} comments={[]}>
        <AuctionStatusBar currentUser="buyer" />
        <Bids sellerName="Seller" currentUserId="buyer" />
        <Comments />
      </AuctionProvider>
    );
    const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
    fireEvent.change(input, { target: { value: "12000" } });
    await act(async () => { fireEvent.submit(input.closest("form")!); });

    expect(screen.getAllByText("$12,000")).toHaveLength(3);
    expect(input).toHaveProperty("min", "12500");
    expect(screen.getByText("2m : 0s")).toBeDefined();
    expect(screen.getByRole("link", { name: "1 bids" })).toBeDefined();
    expect(screen.getByLabelText("Auction closing progress").firstElementChild).toHaveProperty("style.width", "100%");
  });

  it("recovers missed bids and comments in every detail view on refresh", async () => {
    const listing = makeListing();
    const view = (updated = listing, bids = [] as ReturnType<typeof makeBid>[], comments = [] as ReturnType<typeof makeComment>[]) => (
      <AuctionProvider listing={updated} bids={bids} comments={comments}>
        <AuctionStatusBar currentUser="buyer" />
        <Bids sellerName="Seller" currentUserId="buyer" />
        <Comments />
      </AuctionProvider>
    );
    const { rerender } = render(view());
    const bid = makeBid();
    const comment = makeComment();
    rerender(view({ ...listing, currentBid: bid.amount, highestBidderId: bid.userId }, [bid], [comment]));
    expect(screen.getAllByText("$12,000")).toHaveLength(3);
    expect(screen.getByText(comment.body!)).toBeDefined();
    expect(screen.getByRole("link", { name: "1 comments" })).toBeDefined();
    const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
    await act(async () => vi.advanceTimersByTime(60000));
    expect(input).toHaveProperty("disabled", true);

    rerender(view({ ...listing, auctionEndsAt: new Date(Date.now() + 120000) }, [bid], [comment]));
    expect(input).toHaveProperty("disabled", false);
    expect(screen.getByText("2m : 0s")).toBeDefined();
  });

  it.each(["browse", "account"])("updates the %s card from refreshed server props", (kind) => {
    const listing = makeListing({ currentBid: 12000 });
    const card = (updated: typeof listing) => kind === "browse"
      ? <ListingBox listing={updated} />
      : <AccountListingBox listing={updated} watching={false} uploaded={true} />;
    const { rerender } = render(card(listing));
    expect(screen.getByText("$12,000")).toBeDefined();
    rerender(card({ ...listing, currentBid: 15000, auctionEndsAt: new Date(Date.now() + 120000) }));
    expect(screen.getByText("$15,000")).toBeDefined();
    expect(screen.queryByText("$12,000")).toBeNull();
  });

  it("lets refreshed watchlist data reach its auction cards", () => {
    const listing = makeListing({ currentBid: 12000 });
    const { rerender } = render(<ListingsDashboard uploaded={[]} initialWatching={[listing]} currentUserId="buyer" />);
    fireEvent.click(screen.getByRole("tab", { name: /Watchlist/ }));
    expect(screen.getByText("$12,000")).toBeDefined();
    rerender(<ListingsDashboard uploaded={[]} initialWatching={[{ ...listing, currentBid: 15000 }]} currentUserId="buyer" />);
    expect(screen.getByText("$15,000")).toBeDefined();
  });

  it.each([null, "", "   "])("uses safe seller and bidder labels for a missing name (%s)", (name) => {
    const bid = makeBid({ user: { name } });
    const listing = makeListing({ currentBid: bid.amount, highestBidderId: bid.userId });
    render(
      <AuctionProvider listing={listing} bids={[bid]} comments={[]}>
        <Bids sellerName={name} currentUserId="buyer" />
      </AuctionProvider>
    );
    expect(screen.getAllByText("Seller")).toHaveLength(2);
    expect(screen.getByText("Bidder")).toBeDefined();
    expect(screen.getByText("$12,000")).toBeDefined();
  });

  it("renders an auction winner when the winning bid record is unavailable", () => {
    render(
      <AuctionProvider listing={makeListing({ status: "ENDED", result: "SOLD", currentBid: 12000, highestBidderId: "missing-bidder" })} bids={[]} comments={[]}>
        <Bids />
      </AuctionProvider>
    );
    expect(screen.getByText("Sold to Bidder, congratulations!")).toBeDefined();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it.each([null, "", "   "])("renders anonymous comments safely for a missing author name (%s)", (name) => {
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[makeComment({ user: { name } })]}>
        <Comments />
      </AuctionProvider>
    );
    expect(screen.getByText("User")).toBeDefined();
    expect(screen.getByText("Service history?")).toBeDefined();
  });

  it("renders comments whose author record has been removed", () => {
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[makeComment({ user: null })]}>
        <Comments />
      </AuctionProvider>
    );
    expect(screen.getByText("User")).toBeDefined();
  });

  it.each(["startingBid", "bidIncrement", "auctionStartsAt", "auctionEndsAt"] as const)("disables bidding when %s is absent", async (field) => {
    render(
      <AuctionProvider listing={makeListing({ [field]: null })} bids={[]} comments={[]}>
        <Bids currentUserId="buyer" />
      </AuctionProvider>
    );
    const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
    expect(input).toHaveProperty("disabled", true);
    expect(input).toHaveProperty("min", "");
    expect(screen.getByText("Bidding is unavailable until the auction is configured.")).toBeDefined();
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("renders absent prices and deadlines without inventing zero values or epoch dates", () => {
    render(
      <AuctionProvider listing={makeListing({ startingBid: null, bidIncrement: null, auctionEndsAt: null })} bids={[]} comments={[]}>
        <Bids />
      </AuctionProvider>
    );
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.getByText("To be announced")).toBeDefined();
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("preserves a valid zero-dollar starting bid", () => {
    render(
      <AuctionProvider listing={makeListing({ startingBid: 0 })} bids={[]} comments={[]}>
        <Bids currentUserId="buyer" />
      </AuctionProvider>
    );
    expect(screen.getByText("$0")).toBeDefined();
    expect(screen.getByRole("spinbutton")).toHaveProperty("min", "0");
    expect(screen.getByRole("spinbutton")).toHaveProperty("disabled", false);
  });

  it("renders listing cards safely before a starting price has been configured", () => {
    render(<ListingBox listing={makeListing({ startingBid: null })} />);
    expect(screen.getByText("To be announced")).toBeDefined();
  });
});
