// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "react-hot-toast";
import { AuctionProvider } from "./AuctionContext";
import AuctionStatusBar from "@/app/listing/[id]/components/AuctionStatusBar";
import Bids from "@/app/listing/[id]/components/Bids";
import MobileAuctionBar from "@/app/listing/[id]/components/MobileAuctionBar";
import Comments from "@/app/listing/[id]/components/Comments";
import AccountListingBox from "@/app/account/components/AccountListingBox";
import ListingsDashboard from "@/app/account/components/ListingsDashboard";
import ListingBox from "@/app/components/ListingBox";
import FeaturedAuction from "@/app/(site)/components/FeaturedAuction";
import { auctionNow, makeBid, makeComment, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import { describeAuction } from "@/app/libs/auction-display";

const mocks = vi.hoisted(() => ({ post: vi.fn(), recordView: vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve({ data: {} })), refresh: vi.fn(), search: "" }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  // The listing page records a view on mount; keep it out of the requests under test.
  const post = (url: string, ...rest: unknown[]) => url === "/api/listing-view" ? mocks.recordView(url, ...rest) : mocks.post(url, ...rest);
  return { ...actual, default: { ...actual.default, post } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { name: "Buyer" } } }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() }, toast: { success: vi.fn(), error: vi.fn() } }));
import { installFakeRealtime } from "@/app/libs/realtime/testing";

let uninstallRealtime = () => {};
beforeEach(() => { uninstallRealtime = installFakeRealtime().uninstall; });
afterEach(() => uninstallRealtime());
vi.mock("@/app/hooks/useWatchlist", () => ({
  default: () => ({ watching: false, isUpdating: false, toggle: vi.fn() }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  vi.clearAllMocks();
  mocks.search = "";
  mocks.post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("shared auction views", () => {
  function biddingViews(listing = makeListing()) {
    return (
      <AuctionProvider listing={listing} bids={[]} comments={[]} viewerId="buyer">
        <AuctionStatusBar />
        <MobileAuctionBar />
        <Bids emailVerified />
      </AuctionProvider>
    );
  }

  it.each([
    ["status bar", <AuctionStatusBar key="status" />],
    ["mobile bar", <MobileAuctionBar key="mobile" />],
    ["bids panel", <Bids key="bids" emailVerified />],
  ])("shows the auction display's syncing message on the %s before the browser clock arrives", (_view, child) => {
    const listing = makeListing();
    const initial = document.createElement("div");
    initial.innerHTML = renderToString(<AuctionProvider listing={listing} viewerId="buyer" bids={[]} comments={[]}>{child}</AuctionProvider>);
    expect(initial.textContent).toContain(describeAuction(listing, null, "buyer").message);
    expect(within(initial).queryByRole("link", { name: "Place a Bid" })).toBeNull();
  });

  it("invites a bid on the listing views once the browser clock arrives", () => {
    const view = biddingViews();
    const initial = document.createElement("div");
    initial.innerHTML = renderToString(view);
    expect(within(initial).getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", true);

    render(view);
    expect(screen.getAllByRole("link", { name: "Place a Bid" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", false);
  });

  it("opens both bidding links and the form when the scheduled start arrives", () => {
    render(biddingViews(makeListing({ auctionStartsAt: new Date(auctionNow.getTime() + 1000) })));
    expect(screen.queryByRole("link", { name: "Place a Bid" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", true);

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getAllByRole("link", { name: "Place a Bid" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", false);
  });

  it("shows a rejected bid's API message while preserving the bid input", async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: "The auction changed; please try again" } },
    });
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[]} viewerId="buyer">
        <Bids emailVerified />
      </AuctionProvider>
    );
    const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
    fireEvent.change(input, { target: { value: "12000" } });
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    expect(toast.error).toHaveBeenCalledWith("The auction changed; please try again");
    expect(input).toHaveProperty("value", "12000");
    expect(screen.queryByText("$12,000")).toBeNull();
  });

  it("updates the overview, bidding form, clock, and activity from a successful bid without Pusher", async () => {
    const listing = makeListing();
    const bid = makeBid();
    const end = new Date(Date.now() + 120000).toISOString();
    mocks.post.mockImplementation((url) => Promise.resolve({
      data: url === "/api/place-bid" ? { bid, currentBid: bid.amount, auctionEndsAt: end } : {},
    }));
    render(
      <AuctionProvider listing={listing} bids={[]} comments={[]} viewerId="buyer">
        <AuctionStatusBar />
        <Bids sellerName="Seller" emailVerified />
        <Comments signedIn />
      </AuctionProvider>
    );
    const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
    fireEvent.change(input, { target: { value: "12000" } });
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });

    expect(screen.getAllByText("$12,000")).toHaveLength(3);
    expect(input).toHaveProperty("min", "12500");
    expect(screen.getByText("2m : 0s")).toBeDefined();
    expect(screen.getByRole("link", { name: "1 bid" })).toBeDefined();
    expect(screen.getByLabelText("Auction closing progress").firstElementChild).toHaveProperty("style.width", "100%");
  });

  it("recovers missed bids and comments in every detail view on refresh", async () => {
    const listing = makeListing();
    const view = (updated = listing, bids = [] as ReturnType<typeof makeBid>[], comments = [] as ReturnType<typeof makeComment>[]) => (
      <AuctionProvider listing={updated} bids={bids} comments={comments} viewerId="buyer">
        <AuctionStatusBar />
        <Bids sellerName="Seller" emailVerified />
        <Comments signedIn />
      </AuctionProvider>
    );
    const { rerender } = render(view());
    const bid = makeBid();
    const comment = makeComment();
    rerender(view({ ...listing, currentBid: bid.amount, highestBidderId: bid.userId }, [bid], [comment]));
    expect(screen.getAllByText("$12,000")).toHaveLength(3);
    expect(screen.getByText(comment.body!)).toBeDefined();
    expect(screen.getByRole("link", { name: "1 comment" })).toBeDefined();
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
      : <AccountListingBox listing={updated} uploaded={true} />;
    const { rerender } = render(card(listing));
    expect(screen.getByText("$12,000")).toBeDefined();
    rerender(card({ ...listing, currentBid: 15000, auctionEndsAt: new Date(Date.now() + 120000) }));
    expect(screen.getByText("$15,000")).toBeDefined();
    expect(screen.queryByText("$12,000")).toBeNull();
  });

  it("lets refreshed watchlist data reach its auction cards", () => {
    mocks.search = "tab=watching";
    const listing = makeListing({ currentBid: 12000 });
    const { rerender } = render(<ListingsDashboard uploaded={[]} initialWatching={[listing]} currentUserId="buyer" />);
    expect(screen.getByText("$12,000")).toBeDefined();
    rerender(<ListingsDashboard uploaded={[]} initialWatching={[{ ...listing, currentBid: 15000 }]} currentUserId="buyer" />);
    expect(screen.getByText("$15,000")).toBeDefined();
  });

  it.each([null, "", "   "])("uses safe seller and bidder labels for a missing name (%s)", (name) => {
    const bid = makeBid({ user: { name } });
    const listing = makeListing({ currentBid: bid.amount, highestBidderId: bid.userId });
    render(
      <AuctionProvider listing={listing} bids={[bid]} comments={[]} viewerId="buyer">
        <Bids sellerName={name} emailVerified />
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
        <Comments signedIn />
      </AuctionProvider>
    );
    expect(screen.getByText("User")).toBeDefined();
    expect(screen.getByText("Service history?")).toBeDefined();
  });

  it("renders comments whose author record has been removed", () => {
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[makeComment({ user: null })]}>
        <Comments signedIn />
      </AuctionProvider>
    );
    expect(screen.getByText("User")).toBeDefined();
  });

  it("offers signed-out visitors a return link and shows an empty activity state", () => {
    const listing = makeListing();
    render(
      <AuctionProvider listing={listing} bids={[]} comments={[]}>
        <Comments signedIn={false} />
      </AuctionProvider>
    );
    const href = screen.getByRole("link", { name: "Sign In to Comment" }).getAttribute("href")!;
    expect(new URL(href, "https://bidlane.invalid").searchParams.get("callbackUrl")).toBe(`/listing/${listing.id}#comments`);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("No comments or bids yet.")).toBeDefined();
  });

  it("validates comments inline, preserves failed drafts, and announces a successful retry", async () => {
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[]}>
        <Comments signedIn />
      </AuctionProvider>
    );
    const input = screen.getByRole("textbox", { name: "Your Comment" });
    const form = input.closest("form")!;
    await act(async () => { fireEvent.submit(form); });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Comment is required");
    expect(document.activeElement).toBe(input);
    expect(mocks.post).not.toHaveBeenCalled();

    const body = "Do you have service records?\nThanks!";
    fireEvent.change(input, { target: { value: body } });
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Please try again shortly." } } });
    await act(async () => { fireEvent.submit(form); });
    expect(screen.getByRole("alert").textContent).toBe("Please try again shortly.");
    expect(input).toHaveProperty("value", body);

    let finish!: (response: unknown) => void;
    mocks.post.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await act(async () => { fireEvent.submit(form); });
    expect(screen.getByRole("button", { name: "Posting…" }).getAttribute("aria-disabled")).toBe("true");
    expect(input).toHaveProperty("readOnly", true);
    await act(async () => { fireEvent.submit(form); });
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post).toHaveBeenLastCalledWith("/api/comments", { listingId: makeListing().id, comment: body });
    await act(async () => { finish({ data: { comment: makeComment({ body }) } }); });
    expect(screen.getByRole("status").textContent).toBe("Comment posted.");
    expect(screen.getByRole("listitem").textContent).toContain(body);
    expect(input).toHaveProperty("value", "");
  });

  it("reveals older activity in batches and moves focus to the first newly shown entry", () => {
    const comments = Array.from({ length: 26 }, (_, index) => makeComment({
      id: `comment-${index}`,
      body: `Comment ${index + 1}`,
      createdAt: new Date(Date.UTC(2026, 8, 4, 0, 10) - index * 1000).toISOString(),
    }));
    render(
      <AuctionProvider listing={makeListing()} bids={[]} comments={[...comments].reverse()}>
        <Comments signedIn={false} />
      </AuctionProvider>
    );
    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(25);
    expect(entries[0].querySelector("time")?.dateTime).toBe("2026-09-04T00:10:00.000Z");
    expect(entries[0].querySelector("time")?.textContent).toBe("Sep 4, 2026");
    expect(screen.queryByText("Comment 26")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Older Activity" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(26);
    expect(document.activeElement?.textContent).toContain("Comment 26");
  });

  it.each(["startingBid", "bidIncrement", "auctionStartsAt", "auctionEndsAt"] as const)("disables bidding when %s is absent", async (field) => {
    render(
      <AuctionProvider listing={makeListing({ [field]: null })} bids={[]} comments={[]} viewerId="buyer">
        <Bids emailVerified />
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
      <AuctionProvider listing={makeListing({ startingBid: 0 })} bids={[]} comments={[]} viewerId="buyer">
        <Bids emailVerified />
      </AuctionProvider>
    );
    expect(screen.getByText("$0")).toBeDefined();
    expect(screen.getByRole("spinbutton")).toHaveProperty("min", "0");
    expect(screen.getByRole("spinbutton")).toHaveProperty("disabled", false);
  });

  it.each([
    ["buyer", null],
    ["seller", "View Bids"],
  ])("shows %s the Closing message on the mobile bar", async (viewer, link) => {
    await act(async () => {
      render(
        <AuctionProvider listing={makeListing({ auctionEndsAt: auctionNow, currentBid: 12000 })} bids={[]} comments={[]} viewerId={viewer}>
          <MobileAuctionBar />
        </AuctionProvider>
      );
    });
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.getByText("Closing")).toBeDefined();
    expect(screen.getByText("$12,000")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Place a Bid" })).toBeNull();
    if (link) expect(screen.queryByRole("link", { name: link })).toBeNull();
  });

  it("hides the mobile bar once the Auction has ended", () => {
    const { container } = render(
      <AuctionProvider listing={makeListing({ status: "ENDED", result: "SOLD", currentBid: 12000 })} bids={[]} comments={[]} viewerId="buyer">
        <MobileAuctionBar />
      </AuctionProvider>
    );
    expect(container.textContent).toBe("");
  });

  it("stops the countdown on a Closing Auction's inventory card", () => {
    const listing = makeListing({ currentBid: 12000, auctionEndsAt: new Date(auctionNow.getTime() + 1000) });
    render(<ListingBox listing={listing} />);
    expect(screen.getByText("1s")).toBeDefined();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.queryByText(/^\d+s$/)).toBeNull();
    expect(screen.getByText("$12,000")).toBeDefined();
  });

  it("renders listing cards safely before a starting price has been configured", () => {
    render(<ListingBox listing={makeListing({ startingBid: null })} />);
    expect(screen.getByText("To be announced")).toBeDefined();
  });

  it("keeps the duplicate photo link out of the tab order and offers editing only before bidding", () => {
    const listing = makeListing({ status: "UPCOMING", coverImage: null });
    const { container, rerender } = render(<ListingBox listing={listing} currentUserId={listing.userId} />);
    const title = screen.getByRole("heading", { level: 3 }).textContent!;
    expect(screen.getByRole("link", { name: title }).getAttribute("href")).toBe(`/listing/${listing.id}`);
    const photoLink = container.querySelector("a img")?.closest("a");
    expect(photoLink?.getAttribute("href")).toBe(`/listing/${listing.id}`);
    expect(photoLink?.getAttribute("tabindex")).toBe("-1");
    expect(photoLink?.getAttribute("aria-hidden")).toBe("true");
    expect(photoLink?.querySelector("img")?.getAttribute("loading")).toBe("lazy");
    expect(screen.getByRole("link", { name: `Edit listing for ${title}` }).getAttribute("href"))
      .toBe(`/listing/${listing.id}#edit-listing`);

    rerender(<ListingBox listing={{ ...listing, status: "LIVE" }} currentUserId={listing.userId} />);
    expect(screen.queryByRole("link", { name: /Edit listing/ })).toBeNull();
  });

  it("updates the card's price without announcing it from the card", () => {
    const listing = makeListing({ currentBid: 12000, coverImage: null });
    const { container, rerender } = render(<ListingBox listing={listing} />);
    expect(screen.getByText("$12,000")).toBeDefined();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("59s")).toBeDefined();

    rerender(<ListingBox listing={{ ...listing, currentBid: 15000 }} />);
    expect(screen.getByText("$15,000")).toBeDefined();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("shows the Closing message in the account dashboard", async () => {
    await act(async () => {
      render(<AccountListingBox listing={makeListing({ auctionEndsAt: auctionNow, currentBid: 12000 })} uploaded={false} />);
    });
    expect(screen.getByText("Closing")).toBeDefined();
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.getByText("$12,000")).toBeDefined();
  });

  it.each([
    [{}, "Live auction"],
    [{ status: "ENDED", result: "SOLD", currentBid: 12000 }, "Sold"],
    [{ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 9000 }, "Ended"],
  ] as const)("labels the account dashboard chip for %j", (overrides, chip) => {
    render(<AccountListingBox listing={makeListing({ reservePrice: 20000, ...overrides })} uploaded={false} />);
    expect(screen.getByText(chip)).toBeDefined();
  });

  it.each([
    [{ result: "SOLD", currentBid: 12000 }, "Sold", "Auction complete"],
    [{ result: "RESERVE_NOT_MET", currentBid: 9000 }, "Ended", "Reserve not met"],
    [{ result: "RESERVE_NOT_MET", currentBid: null }, "Ended", "No bids placed"],
  ] as const)("shows the featured card's headline and result line for %j", (overrides, headline, line) => {
    render(<FeaturedAuction listing={makeListing({ status: "ENDED", reservePrice: 20000, ...overrides })} />);
    expect(screen.getByText(headline)).toBeDefined();
    expect(screen.getByText(line)).toBeDefined();
    expect(screen.getByText(/View Result/)).toBeDefined();
  });

  it("shows the Closing message on the featured card", async () => {
    await act(async () => {
      render(<FeaturedAuction listing={makeListing({ auctionEndsAt: auctionNow, currentBid: 12000 })} />);
    });
    expect(screen.getByText("Closing")).toBeDefined();
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.getByText(/View Auction/)).toBeDefined();
  });

  it("uses one featured listing link and announces bid and status changes from one live region", () => {
    const listing = makeListing({ currentBid: 12000, coverImage: null, images: [] });
    const { container, rerender } = render(<FeaturedAuction listing={listing} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);

    const regions = container.querySelectorAll("[aria-live]");
    expect(regions).toHaveLength(1);
    const [region] = regions;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("2020 Porsche 911: Live auction. Current bid $12,000.");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("59s left").closest("[aria-live]")).toBeNull();
    expect(region.textContent).toBe("2020 Porsche 911: Live auction. Current bid $12,000.");

    rerender(<FeaturedAuction listing={{ ...listing, currentBid: 15000, status: "ENDED", result: "SOLD" }} />);
    expect(region.textContent).toBe("2020 Porsche 911: Sold. Sold for $15,000.");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("recording a view", () => {
  const viewRequests = () => mocks.recordView.mock.calls;

  it("records one view from the listing page, and another when a different viewer signs in", () => {
    const listing = makeListing();
    const { rerender } = render(<AuctionProvider listing={listing} bids={[]} comments={[]}><MobileAuctionBar /></AuctionProvider>);
    rerender(<AuctionProvider listing={{ ...listing, currentBid: 12000 }} bids={[]} comments={[]}><MobileAuctionBar /></AuctionProvider>);
    expect(viewRequests()).toEqual([["/api/listing-view", { listingId: listing.id }]]);
    rerender(<AuctionProvider listing={listing} viewerId="buyer" bids={[]} comments={[]}><MobileAuctionBar /></AuctionProvider>);
    expect(viewRequests()).toHaveLength(2);
  });

  it("never records a view from an auction card", () => {
    render(<><ListingBox listing={makeListing()} currentUserId="buyer" /><FeaturedAuction listing={makeListing()} currentUserId="buyer" /></>);
    expect(viewRequests()).toHaveLength(0);
  });
});
