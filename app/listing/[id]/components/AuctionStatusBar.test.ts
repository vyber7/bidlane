// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import type { Listing } from "@prisma/client";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));
vi.mock("@/app/hooks/useWatchlist", () => ({
  default: () => ({ watching: false, isUpdating: false, toggle: vi.fn() }),
}));

import AuctionStatusBar from "./AuctionStatusBar";

function auction(listing: Listing, currentUser = "seller") {
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
  it("enables the seller's retry button after finalization settles", async () => {
    await act(async () => {
      render(auction(makeListing({ auctionEndsAt: auctionNow })));
    });
    expect(screen.getByRole("button", { name: "Retry finalization" })).toHaveProperty("disabled", false);
  });

  it.each(["seller", "visitor"])("requests finalization on expiry for %s", async (user) => {
    await act(async () => {
      render(auction(makeListing({ auctionEndsAt: auctionNow }), user));
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/auction-finalize", { listingId: makeListing().id });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("keeps the seller button disabled and skips finalization before expiry", () => {
    render(auction(makeListing()));
    expect(screen.getByRole("button", { name: "End auction" })).toHaveProperty("disabled", true);
    expect(mocks.post).not.toHaveBeenCalledWith("/api/auction-finalize", expect.anything());
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
