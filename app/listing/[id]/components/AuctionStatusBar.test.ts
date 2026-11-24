// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import type { PublicListing } from "@/app/libs/listing-payload";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));
import { installFakeRealtime } from "@/app/libs/realtime/testing";

let uninstallRealtime = () => {};
beforeEach(() => { uninstallRealtime = installFakeRealtime().uninstall; });
afterEach(() => uninstallRealtime());
vi.mock("@/app/hooks/useWatchlist", () => ({
  default: () => ({ watching: false, isUpdating: false, toggle: vi.fn() }),
}));

import AuctionStatusBar from "./AuctionStatusBar";

function auction(listing: PublicListing, currentUser = "seller") {
  return createElement(AuctionProvider, {
    listing, bids: [], comments: [],
  }, createElement(AuctionStatusBar, { currentUser }));
}

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

describe("auction expiry controls", () => {
  it("announces price and status changes while leaving countdown ticks quiet", () => {
    const listing = makeListing();
    const { rerender } = render(auction(listing));
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toContain("Live auction. Starting bid $10,000.");
    act(() => vi.advanceTimersByTime(1000));
    expect(liveRegion.textContent).toContain("Live auction. Starting bid $10,000.");
    rerender(auction({ ...listing, currentBid: 12000 }));
    expect(liveRegion.textContent).toContain("Current bid $12,000.");
    rerender(auction({ ...listing, currentBid: 12000, status: "ENDED", result: "SOLD" }));
    expect(liveRegion.textContent).toContain("Sold. Sold for $12,000.");
  });

  it.each([
    ["seller", "View sale details"],
    ["buyer", "View purchase details"],
  ])("takes the sold vehicle's %s to the handoff details", (user, label) => {
    render(auction(makeListing({ status: "ENDED", result: "SOLD", currentBid: 10000, highestBidderId: "buyer" }), user));
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(`/account/shipments#transaction-${makeListing().id}`);
  });

  it.each(["visitor", ""])("does not offer contact details to an uninvolved visitor (%s)", (user) => {
    render(auction(makeListing({ status: "ENDED", result: "SOLD", currentBid: 10000, highestBidderId: "buyer" }), user));
    expect(screen.queryByRole("link", { name: /View (purchase|sale) details/ })).toBeNull();
  });

  it("does not offer a sale handoff when the reserve was not met", () => {
    render(auction(makeListing({ status: "ENDED", result: "RESERVE_NOT_MET", highestBidderId: "buyer" })));
    expect(screen.queryByRole("link", { name: /View (purchase|sale) details/ })).toBeNull();
  });

  it("enables the seller's retry button after finalization settles", async () => {
    await act(async () => {
      render(auction(makeListing({ auctionEndsAt: auctionNow })));
    });
    expect(screen.getByText("Closing")).toBeDefined();
    mocks.post.mockClear();
    await act(async () => {
      screen.getByRole("button", { name: "Retry finalization" }).click();
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/auction-finalize", { listingId: makeListing().id });
  });

  it.each(["seller", "visitor"])("requests finalization on expiry for %s", async (user) => {
    await act(async () => {
      render(auction(makeListing({ auctionEndsAt: auctionNow }), user));
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/auction-finalize", { listingId: makeListing().id });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("offers the seller no ending control and skips finalization before expiry", () => {
    render(auction(makeListing()));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Your auction is live/)).toBeDefined();
    expect(mocks.post).not.toHaveBeenCalledWith("/api/auction-finalize", expect.anything());
  });

  it("shows a buyer the Closing message while keeping the price", async () => {
    await act(async () => {
      render(auction(makeListing({ auctionEndsAt: auctionNow, currentBid: 12000 }), "buyer"));
    });
    expect(screen.getByText("Closing")).toBeDefined();
    expect(screen.getByText("Finalizing results…")).toBeDefined();
    expect(screen.getByText("$12,000")).toBeDefined();
    expect(screen.queryByText("Time left")).toBeNull();
  });

  it.each([
    [{ result: "SOLD", currentBid: 12000 }, "Auction complete", "Sold. Sold for $12,000. Auction complete."],
    [{ result: "RESERVE_NOT_MET", currentBid: 9000 }, "Reserve not met", "Ended. Highest bid $9,000. Reserve not met."],
    [{ result: "RESERVE_NOT_MET", currentBid: null }, "No bids placed", "Ended. No bids placed."],
  ] as const)("shows and announces the result of an ended Auction %j", (overrides, note, announcement) => {
    render(auction(makeListing({ status: "ENDED", reservePrice: 20000, ...overrides }), "buyer"));
    expect(screen.getByText(note)).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe(announcement);
  });

  it("invites a signed-out visitor to bid on an Open Auction", () => {
    render(createElement(AuctionProvider, { listing: makeListing(), bids: [], comments: [] }, createElement(AuctionStatusBar, {})));
    expect(screen.getByRole("link", { name: "Place a bid" })).toBeDefined();
  });

  it("does not request finalization again for an ended auction", () => {
    render(auction(makeListing({ status: "ENDED", auctionEndsAt: auctionNow })));
    expect(mocks.post).not.toHaveBeenCalledWith("/api/auction-finalize", expect.anything());
  });

  it("uses the refreshed deadline for both the countdown and progress bar", () => {
    const listing = makeListing();
    const { rerender } = render(auction(listing));
    expect(screen.getByText("1m : 0s")).toBeDefined();
    expect(screen.getByLabelText("Auction closing progress").firstElementChild).toHaveProperty("style.width", "50%");
    act(() => vi.advanceTimersByTime(1000));
    rerender(auction({ ...listing, auctionEndsAt: new Date(Date.now() + 90000) }));
    expect(screen.getByText("1m : 30s")).toBeDefined();
    expect(screen.getByLabelText("Auction closing progress").firstElementChild).toHaveProperty("style.width", "75%");
  });

  it("finalizes a newly extended deadline even if the previous deadline was already requested", async () => {
    const listing = makeListing({ auctionEndsAt: auctionNow });
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(auction(listing)); });
    mocks.post.mockClear();
    view!.rerender(auction({ ...listing, auctionEndsAt: new Date(Date.now() + 1000) }));
    expect(mocks.post).not.toHaveBeenCalledWith("/api/auction-finalize", expect.anything());
    await act(async () => vi.advanceTimersByTime(1000));
    expect(mocks.post.mock.calls.filter(([url]) => url === "/api/auction-finalize")).toHaveLength(1);
  });

  it("keeps a newer finalization pending when an older request finishes late", async () => {
    const finish: Array<(value: unknown) => void> = [];
    mocks.post.mockImplementation((url) => url === "/api/auction-finalize"
      ? new Promise((resolve) => finish.push(resolve))
      : Promise.resolve({ data: {} }));
    const listing = makeListing({ auctionEndsAt: auctionNow });
    const { rerender } = render(auction(listing));
    rerender(auction({ ...listing, auctionEndsAt: new Date(Date.now() + 1000) }));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(finish).toHaveLength(2);

    await act(async () => finish[0]({ data: {} }));
    expect(screen.getByRole("button", { name: "Finalizing auction…" })).toHaveProperty("disabled", true);
    await act(async () => finish[1]({ data: {} }));
    expect(screen.getByRole("button", { name: "Retry finalization" })).toHaveProperty("disabled", false);
  });
});
