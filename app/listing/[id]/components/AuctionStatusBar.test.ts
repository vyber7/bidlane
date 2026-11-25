// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import type { PublicListing } from "@/app/libs/listing-codec";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { installFakeRealtime } from "@/app/libs/realtime/testing";

let uninstallRealtime = () => {};
beforeEach(() => { uninstallRealtime = installFakeRealtime().uninstall; });
afterEach(() => uninstallRealtime());
vi.mock("@/app/hooks/useWatchlist", () => ({
  default: () => ({ watching: false, isUpdating: false, toggle: vi.fn() }),
}));

import AuctionStatusBar from "./AuctionStatusBar";

function auction(listing: PublicListing, viewerId = "seller") {
  return createElement(AuctionProvider, {
    listing, viewerId, bids: [], comments: [],
  }, createElement(AuctionStatusBar));
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
    ["seller", "View Sale Details"],
    ["buyer", "View Purchase Details"],
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
    expect(screen.getByRole("button", { name: "Retry Finalization" })).toHaveProperty("disabled", false);
    mocks.post.mockClear();
    await act(async () => {
      screen.getByRole("button", { name: "Retry Finalization" }).click();
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/auction-finalize", { listingId: makeListing().id });
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
    expect(screen.getByRole("link", { name: "Place a Bid" })).toBeDefined();
  });

  it("uses the refreshed deadline for both the countdown and progress bar", () => {
    const listing = makeListing();
    const { rerender } = render(auction(listing));
    expect(screen.getByText("1m : 0s")).toBeDefined();
    expect(screen.getByRole("progressbar", { name: "Auction closing progress" }).getAttribute("aria-valuenow")).toBe("50");
    act(() => vi.advanceTimersByTime(1000));
    rerender(auction({ ...listing, auctionEndsAt: new Date(Date.now() + 90000) }));
    expect(screen.getByText("1m : 30s")).toBeDefined();
    expect(screen.getByRole("progressbar", { name: "Auction closing progress" }).getAttribute("aria-valuenow")).toBe("75");
  });

});

describe("auction status panel semantics", () => {
  it("exposes the Extension window as a progressbar with its current value", () => {
    render(auction(makeListing()));
    const progress = screen.getByRole("progressbar", { name: "Auction closing progress" });
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    expect(progress.getAttribute("aria-valuetext")).toBe("1m : 0s left");
  });

  it("shows no progressbar outside the Extension window", () => {
    render(auction(makeListing({ auctionEndsAt: new Date(auctionNow.getTime() + 3600000) })));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps decorative icons and the live dot out of accessible names", () => {
    const { container } = render(auction(makeListing({ commentsIds: [] }), "buyer"));
    expect(container.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    expect(screen.getByText("●").getAttribute("aria-hidden")).toBe("true");
  });

  it("names count links by their counts and announces comments only through the status line", () => {
    render(auction(makeListing(), "buyer"));
    const comments = screen.getByRole("link", { name: "0 comments" });
    expect(comments.getAttribute("aria-live")).toBeNull();
    expect(screen.getByRole("link", { name: "0 bids" })).toBeDefined();
  });
});
