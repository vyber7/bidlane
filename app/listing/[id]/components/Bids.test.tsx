// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makeBid, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import Bids from "./Bids";

const mocks = vi.hoisted(() => ({ post: vi.fn(), recordView: vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve({ data: {} })), refresh: vi.fn(), useSession: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  // The listing page records a view on mount; keep it out of the requests under test.
  const post = (url: string, ...rest: unknown[]) => url === "/api/listing-view" ? mocks.recordView(url, ...rest) : mocks.post(url, ...rest);
  return { ...actual, default: { ...actual.default, post } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-auth/react", () => ({ useSession: mocks.useSession }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { installFakeRealtime } from "@/app/libs/realtime/testing";

let uninstallRealtime = () => {};
beforeEach(() => { uninstallRealtime = installFakeRealtime().uninstall; });
afterEach(() => uninstallRealtime());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ data: { user: { name: "Buyer" } } });
  mocks.post.mockResolvedValue({ data: {
    bid: makeBid(), currentBid: 12000,
    auctionEndsAt: new Date(auctionNow.getTime() + 120000).toISOString(),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function view(listing = makeListing()) {
  return <AuctionProvider listing={listing} bids={[]} comments={[]} viewerId="buyer"><Bids emailVerified /></AuctionProvider>;
}

async function reviewBid(amount = "12000") {
  const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
  fireEvent.change(input, { target: { value: amount } });
  await act(async () => { fireEvent.submit(input.closest("form")!); });
  return input;
}

describe("auction description in the bids panel", () => {
  it("formats the view and Watcher counts with thousands separators", () => {
    render(view({ ...makeListing({ views: 12345 }), watcherCount: 1250 }));
    expect(screen.getByText("12,345")).toBeDefined();
    expect(screen.getByText("1,250")).toBeDefined();
  });

  it("pairs each bid summary value with its label in a description list", () => {
    render(view({ ...makeListing({ views: 12345 }), watcherCount: 1250 }));
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["Seller", "Ending", "Views", "Watching", "Bids"]);
    const views = screen.getAllByRole("definition")[terms.indexOf("Views")];
    expect(views.textContent?.trim()).toBe("12,345");
  });

  it("shows an example bid pattern as the placeholder", () => {
    render(view(makeListing({ currentBid: 12000 })));
    expect(screen.getByRole("spinbutton", { name: "Your bid amount in dollars" }).getAttribute("placeholder")).toMatch(/…$/);
  });

  it("formats the current price, minimum, and reviewed bid as whole dollars", async () => {
    render(view(makeListing({ currentBid: 12000, highestBidderId: "other-buyer" })));
    expect(screen.getByText("$12,000")).toBeDefined();
    expect(screen.getByText("Minimum next bid: $12,500")).toBeDefined();
    await reviewBid("1250000");
    const review = screen.getByRole("region", { name: "Review Your Bid" });
    expect(within(review).getByText("$1,250,000")).toBeDefined();
    expect(within(review).getByRole("button", { name: "Confirm Bid of $1,250,000" })).toBeDefined();
  });

  it.each([
    [{ currentBid: null }, "No bids placed", null],
    [{ currentBid: 9000 }, "Reserve not met", "Highest bid"],
  ] as const)("shows an Unsold Auction's result note with %j", (overrides, note, priceLabel) => {
    render(view(makeListing({ status: "ENDED", result: "RESERVE_NOT_MET", reservePrice: 20000, ...overrides })));
    expect(screen.getByText(note)).toBeDefined();
    if (priceLabel) expect(screen.getByText(priceLabel)).toBeDefined();
    expect(screen.queryByText(/No bids were placed|Reserve not met\. Highest bid/)).toBeNull();
  });

  it("stays hidden while the Auction is Upcoming and appears once it starts", () => {
    const listing = makeListing({ status: "UPCOMING" });
    const { container, rerender } = render(view(listing));
    expect(container.querySelector("#bids")).toBeNull();

    rerender(view({ ...listing, status: "LIVE" }));
    expect(container.querySelector("#bids")).not.toBeNull();
  });

  it("keeps the seller's own Open Auction free of bidding guidance", () => {
    render(<AuctionProvider listing={makeListing()} bids={[]} comments={[]} viewerId="seller"><Bids emailVerified /></AuctionProvider>);
    expect(screen.queryByText(/Your auction is live/)).toBeNull();
  });

  it("shows bidders the Closing message and disables bidding", async () => {
    await act(async () => { render(view(makeListing({ auctionEndsAt: auctionNow }))); });
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.queryByText(/Bidding has closed/)).toBeNull();
    expect(screen.getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", true);
  });
});

describe("bid review", () => {
  it("links signed-out bidders back to this auction and shows a closing time with a time zone", () => {
    mocks.useSession.mockReturnValue({ data: null });
    const listing = makeListing();
    const { container } = render(view(listing));
    const href = screen.getByRole("link", { name: "Sign In to Bid" }).getAttribute("href")!;
    expect(new URL(href, "https://bidlane.invalid").searchParams.get("callbackUrl")).toBe(`/listing/${listing.id}#bids`);
    const time = container.querySelector("time");
    expect(time?.dateTime).toBe(listing.auctionEndsAt?.toISOString());
    expect(time?.textContent).toContain("UTC");
  });

  it("guides an unverified bidder to verification and disables new bids", () => {
    render(<AuctionProvider listing={makeListing()} bids={[]} comments={[]} viewerId="buyer"><Bids emailVerified={false} /></AuctionProvider>);
    expect(screen.getByRole("link", { name: "Verify email in your profile" }).getAttribute("href")).toBe("/account/profile");
    expect(screen.getByRole("button", { name: "Review Bid" })).toHaveProperty("disabled", true);
  });

  it.each([
    new Error("Network response lost"),
    { isAxiosError: true, response: { status: 500 } },
    { isAxiosError: true, response: { status: 503 } },
  ])("retains the request key and amount after an uncertain outcome, even after auction end (%j)", async (error) => {
    mocks.post.mockRejectedValueOnce(error);
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    const firstRequest = mocks.post.mock.calls[0];
    expect(firstRequest[2].headers["Idempotency-Key"]).toMatch(/^[a-f0-9-]{36}$/);
    expect(screen.getByRole("alert").textContent).toContain("couldn’t confirm");
    expect(screen.getByRole("button", { name: "Edit Bid" })).toHaveProperty("disabled", true);
    rerender(view({ ...listing, status: "ENDED", currentBid: 13000, highestBidderId: "other-buyer" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry Same Bid" })); });
    expect(mocks.post.mock.calls[1]).toEqual(firstRequest);
    expect(screen.getByText("Your bid of $12,000 was accepted.")).toBeDefined();
    expect(screen.queryByText("You’re leading")).toBeNull();
  });


  it("uses a fresh key for a subsequent bid after success", async () => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    rerender(view({ ...listing, currentBid: 13000, highestBidderId: "other-buyer" }));
    await reviewBid("14000");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $14,000" })); });
    expect(mocks.post.mock.calls[1][2].headers["Idempotency-Key"]).not.toBe(mocks.post.mock.calls[0][2].headers["Idempotency-Key"]);
  });

  it("uses a new key for a new confirmation after a definitive rejection", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { error: "Auction changed" } } });
    render(view());
    await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    await reviewBid("13000");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $13,000" })); });
    expect(mocks.post.mock.calls[1][2].headers["Idempotency-Key"]).not.toBe(mocks.post.mock.calls[0][2].headers["Idempotency-Key"]);
  });

  it("requires an explicit confirmation of the vehicle, amount, and commitment before posting", async () => {
    render(view());
    expect(screen.getByText("Minimum next bid: $10,000")).toBeDefined();
    const input = await reviewBid();
    const review = screen.getByRole("region", { name: "Review Your Bid" });
    expect(review.textContent).toContain("2020 Porsche 911");
    expect(review.textContent).toContain("$12,000");
    expect(review.textContent).toContain("you commit to purchasing this vehicle");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review Your Bid" }));
    expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/api/place-bid", { listingId: makeListing().id, bidAmount: 12000 }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(screen.queryByRole("region", { name: "Review Your Bid" })).toBeNull();
    expect(screen.getByText("Your bid of $12,000 was accepted.")).toBeDefined();
    expect(screen.getByText("You’re leading")).toBeDefined();
    expect(input).toHaveProperty("value", "");
    expect(input).toHaveProperty("min", "12500");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("lets bidders edit without posting and restores focus and their amount", async () => {
    render(view());
    const input = await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Edit Bid" })); });
    // React Hook Form defers setFocus to the next timer tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("region", { name: "Review Your Bid" })).toBeNull();
    expect(input).toHaveProperty("value", "12000");
    expect(document.activeElement).toBe(input);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(["", "9999", "12000.5", "2147483648"])("rejects invalid amount %j before review", async (amount) => {
    render(view());
    await reviewBid(amount);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Review Your Bid" })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([
    { offered: "12000", updated: 13500, confirmLabel: "Confirm Bid of $13,500" },
    { offered: "20000", updated: 20000, confirmLabel: "Confirm Bid of $20,000" },
  ])("requires another review after a price change, keeping the bidder's higher offer ($offered)", async ({ offered, updated, confirmLabel }) => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid(offered);
    rerender(view({ ...listing, currentBid: 13000, highestBidderId: "other-buyer" }));
    expect(screen.getByRole("alert").textContent).toContain("The minimum is now $13,500");
    expect(screen.queryByRole("button", { name: /^Confirm bid/ })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review Updated Bid" })); });
    expect(mocks.post).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("button", { name: confirmLabel });
    mocks.post.mockResolvedValueOnce({ data: { bid: makeBid({ amount: updated }), currentBid: updated, auctionEndsAt: listing.auctionEndsAt!.toISOString() } });
    await act(async () => { fireEvent.click(confirmation); });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/api/place-bid", { listingId: listing.id, bidAmount: updated }, { headers: { "Idempotency-Key": expect.any(String) } });
  });

  it("blocks confirmation when the auction expires during review", async () => {
    render(view());
    await reviewBid();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getByRole("alert").textContent).toBe("This auction is no longer accepting bids.");
    const confirm = screen.getByRole("button", { name: "Confirm Bid of $12,000" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.click(confirm);
    // The expired Auction asks for Finalization, but no bid is sent.
    expect(mocks.post).not.toHaveBeenCalledWith("/api/place-bid", expect.anything(), expect.anything());
    expect(mocks.post).toHaveBeenCalledWith("/api/auction-finalize", { listingId: makeListing().id });
  });

  it("removes confirmation when a live auction-ended event is received", async () => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid();
    rerender(view({ ...listing, status: "ENDED", result: "RESERVE_NOT_MET" }));
    expect(screen.queryByRole("button", { name: /^Confirm bid/ })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("only submits once while a confirmed bid is pending", async () => {
    let resolve!: (response: unknown) => void;
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(view());
    await reviewBid();
    const confirm = screen.getByRole("button", { name: "Confirm Bid of $12,000" });
    await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Placing Bid…" })).toHaveProperty("disabled", true);
    await act(async () => { resolve({ data: { bid: makeBid(), currentBid: 12000, auctionEndsAt: makeListing().auctionEndsAt!.toISOString() } }); });
  });

  it("recovers a rejected confirmation with the amount preserved and a fresh auction request", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { error: "The auction changed; please try again" } } });
    render(view());
    const input = await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    // React Hook Form defers setFocus to the next timer tick.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("alert").textContent).toBe("The auction changed; please try again");
    expect(screen.queryByRole("region", { name: "Review Your Bid" })).toBeNull();
    expect(input).toHaveProperty("value", "12000");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByText("You’re leading")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps the accepted amount but stops saying the bidder leads after being outbid", async () => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm Bid of $12,000" })); });
    rerender(view({ ...listing, currentBid: 13000, highestBidderId: "other-buyer" }));
    expect(screen.getByText("Your bid of $12,000 was accepted.")).toBeDefined();
    expect(screen.queryByText("You’re leading")).toBeNull();
    expect(screen.getByText("You’ve been outbid")).toBeDefined();
  });
});
