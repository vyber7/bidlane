// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makeBid, makeListing } from "@/app/test/auction-fixtures";
import Bids from "./Bids";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { name: "Buyer" } } }) }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ data: {
    bid: makeBid(), currentBid: 12000,
    auctionEndsAt: new Date(auctionNow.getTime() + 120000).toISOString(),
  } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function view(listing = makeListing()) {
  return <AuctionProvider listing={listing} bids={[]} comments={[]}><Bids currentUserId="buyer" /></AuctionProvider>;
}

async function reviewBid(amount = "12000") {
  const input = screen.getByRole("spinbutton", { name: "Your bid amount in dollars" });
  fireEvent.change(input, { target: { value: amount } });
  await act(async () => { fireEvent.submit(input.closest("form")!); });
  return input;
}

describe("bid review", () => {
  it("requires an explicit confirmation of the vehicle, amount, and commitment before posting", async () => {
    render(view());
    expect(screen.getByText("Minimum next bid: $10,000")).toBeDefined();
    const input = await reviewBid();
    const review = screen.getByRole("region", { name: "Review your bid" });
    expect(review.textContent).toContain("2020 Porsche 911");
    expect(review.textContent).toContain("$12,000");
    expect(review.textContent).toContain("you commit to purchasing this vehicle");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review your bid" }));
    expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm bid of $12,000" })); });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/api/place-bid", { listingId: makeListing().id, bidAmount: 12000 });
    expect(screen.queryByRole("region", { name: "Review your bid" })).toBeNull();
    expect(screen.getByText("Your bid of $12,000 was accepted.")).toBeDefined();
    expect(screen.getByText("You’re leading")).toBeDefined();
    expect(input).toHaveProperty("value", "");
    expect(input).toHaveProperty("min", "12500");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("lets bidders edit without posting and restores focus and their amount", async () => {
    render(view());
    const input = await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Edit bid" })); });
    expect(screen.queryByRole("region", { name: "Review your bid" })).toBeNull();
    expect(input).toHaveProperty("value", "12000");
    expect(document.activeElement).toBe(input);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(["", "9999", "12000.5", "2147483648"])("rejects invalid amount %j before review", async (amount) => {
    render(view());
    await reviewBid(amount);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Review your bid" })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([
    { offered: "12000", updated: 13500 },
    { offered: "20000", updated: 20000 },
  ])("requires another review after a price change, keeping the bidder's higher offer ($offered)", async ({ offered, updated }) => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid(offered);
    rerender(view({ ...listing, currentBid: 13000, highestBidderId: "other-buyer" }));
    expect(screen.getByRole("alert").textContent).toContain("The minimum is now $13,500");
    expect(screen.queryByRole("button", { name: /^Confirm bid/ })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review updated bid" })); });
    expect(mocks.post).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("button", { name: `Confirm bid of $${updated.toLocaleString("en-US")}` });
    mocks.post.mockResolvedValueOnce({ data: { bid: makeBid({ amount: updated }), currentBid: updated, auctionEndsAt: listing.auctionEndsAt!.toISOString() } });
    await act(async () => { fireEvent.click(confirmation); });
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/api/place-bid", { listingId: listing.id, bidAmount: updated });
  });

  it("blocks confirmation when the auction expires during review", async () => {
    render(view());
    await reviewBid();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(screen.getByRole("alert").textContent).toBe("This auction is no longer accepting bids.");
    const confirm = screen.getByRole("button", { name: "Confirm bid of $12,000" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.click(confirm);
    expect(mocks.post).not.toHaveBeenCalled();
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
    const confirm = screen.getByRole("button", { name: "Confirm bid of $12,000" });
    await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Placing bid…" })).toHaveProperty("disabled", true);
    await act(async () => { resolve({ data: { bid: makeBid(), currentBid: 12000, auctionEndsAt: makeListing().auctionEndsAt!.toISOString() } }); });
  });

  it("recovers a rejected confirmation with the amount preserved and a fresh auction request", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { error: "The auction changed; please try again" } } });
    render(view());
    const input = await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm bid of $12,000" })); });
    expect(screen.getByRole("alert").textContent).toBe("The auction changed; please try again");
    expect(screen.queryByRole("region", { name: "Review your bid" })).toBeNull();
    expect(input).toHaveProperty("value", "12000");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByText("You’re leading")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps the accepted amount but stops saying the bidder leads after being outbid", async () => {
    const listing = makeListing();
    const { rerender } = render(view(listing));
    await reviewBid();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm bid of $12,000" })); });
    rerender(view({ ...listing, currentBid: 13000, highestBidderId: "other-buyer" }));
    expect(screen.getByText("Your bid of $12,000 was accepted.")).toBeDefined();
    expect(screen.queryByText("You’re leading")).toBeNull();
    expect(screen.getByText("You’ve been outbid")).toBeDefined();
  });
});
