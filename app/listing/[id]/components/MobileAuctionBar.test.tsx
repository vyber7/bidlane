// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionProvider } from "@/app/context/AuctionContext";
import { auctionNow, makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import MobileAuctionBar from "./MobileAuctionBar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/hooks/usePusherEvent", () => ({ default: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(auctionNow);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function view(listing = makeListing(), currentUserId?: string) {
  return (
    <AuctionProvider listing={listing} bids={[]} comments={[]}>
      <MobileAuctionBar currentUserId={currentUserId} />
    </AuctionProvider>
  );
}

describe("mobile auction quick actions", () => {
  it("follows auction starts, refreshed prices and extensions, expiry, and final results", () => {
    const listing = makeListing();
    const { rerender } = render(view({ ...listing, status: "UPCOMING" }));
    expect(screen.queryByRole("region", { name: "Live auction quick actions" })).toBeNull();

    rerender(view(listing));
    expect(screen.getByText("Starting bid")).toBeDefined();
    expect(screen.getByText("$10,000")).toBeDefined();
    expect(screen.getByText("Time left: 1m : 0s")).toBeDefined();
    expect(screen.getByRole("link", { name: "Place a bid" }).getAttribute("href")).toBe("#bids");

    const updated = { ...listing, currentBid: 12000, auctionEndsAt: new Date(Date.now() + 120000) };
    rerender(view(updated));
    expect(screen.getByText("Current bid")).toBeDefined();
    expect(screen.getByText("$12,000")).toBeDefined();
    expect(screen.getByText("Time left: 2m : 0s")).toBeDefined();

    act(() => vi.advanceTimersByTime(120000));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Finalizing…");

    rerender(view({ ...updated, status: "ENDED", result: "SOLD" }));
    expect(screen.queryByRole("region", { name: "Live auction quick actions" })).toBeNull();
  });

  it("lets sellers review bids without inviting them to bid on their own vehicle", () => {
    render(view(makeListing(), "seller"));
    expect(screen.getByRole("link", { name: "View bids" }).getAttribute("href")).toBe("#bids");
    expect(screen.queryByRole("link", { name: "Place a bid" })).toBeNull();
  });

  it.each([
    { auctionEndsAt: null },
    { startingBid: null },
    { bidIncrement: null },
    { currentBid: 2_147_483_647 },
  ])("does not offer a bid the bidding form cannot accept (%j)", (overrides) => {
    render(view(makeListing(overrides), "buyer"));
    expect(screen.queryByRole("link", { name: "Place a bid" })).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
  });
});
