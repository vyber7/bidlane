// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { buildBidSummaries } from "../lib/bids";
import BidsAndWinsDashboard from "./BidsAndWinsDashboard";

const router = vi.hoisted(() => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => router,
  usePathname: () => window.location.pathname,
}));

let realtime: FakeRealtime;
beforeEach(() => {
  realtime = installFakeRealtime();
  window.history.replaceState(null, "", "/account/bids-and-wins");
});
afterEach(() => {
  cleanup();
  realtime.uninstall();
});

it("opens the Wins tab from a URL even when active bids exist", () => {
  window.history.replaceState(null, "", "/account/bids-and-wins?tab=wins");
  const bid = (listing: ReturnType<typeof makeListing>) => ({
    id: `bid-${listing.id}`, listingId: listing.id, userId: "buyer", amount: listing.currentBid ?? 0,
    createdAt: new Date("2026-10-14T00:10:00Z"), listing,
  });
  const bids = buildBidSummaries([
    bid(makeListing({ id: "active", model: "Cayman", currentBid: 40000, auctionEndsAt: new Date(Date.now() + 3_600_000) })),
    bid(makeListing({ id: "win", status: "ENDED", result: "SOLD", currentBid: 50000, highestBidderId: "buyer" })),
  ], "buyer");
  render(<BidsAndWinsDashboard bids={bids} currentUserId="buyer" />);

  const selected = screen.getByRole("tab", { name: "Wins 1", selected: true });
  expect(screen.getByRole("tabpanel").id).toBe(selected.getAttribute("aria-controls"));
  expect(screen.queryByRole("heading", { name: "2020 Porsche Cayman" })).toBeNull();
  expect(screen.getByText("Oct 14, 2026")).toBeDefined();
  expect(screen.getByRole("link", { name: "Complete Transaction" }).getAttribute("href")).toBe("/account/shipments#transaction-win");
});

describe("following Real-time updates", () => {
  const now = Date.now();
  const leading = () => buildBidSummaries([{
    id: "bid", listingId: "active", userId: "buyer", amount: 12000, createdAt: new Date(now - 60_000),
    listing: makeListing({
      id: "active", model: "Cayman", currentBid: 12000, highestBidderId: "buyer",
      auctionStartsAt: new Date(now - 3_600_000), auctionEndsAt: new Date(now + 3_600_000),
    }),
  }], "buyer", now);
  const tab = (name: RegExp) => screen.getByRole("tab", { name });
  const stat = (label: string) => screen.getByText(label, { selector: "div" }).parentElement!.textContent;
  const end = (result: "SOLD" | "RESERVE_NOT_MET") => act(() =>
    realtime.deliver("listing:active", "auction-ended", { auctionEndsAt: new Date(now).toISOString(), result }));

  it("moves an Auction I win from Active Bids to Wins, with its Complete Transaction link", () => {
    const bids = leading();
    const { rerender } = render(<BidsAndWinsDashboard bids={bids} currentUserId="buyer" />);
    expect(tab(/Active Bids 1/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Leading", { selector: "span" })).toBeDefined();

    end("SOLD");
    expect(tab(/Active Bids 0/)).toBeDefined();
    expect(stat("Won value")).toContain("12,000");
    window.history.replaceState(null, "", "/account/bids-and-wins?tab=wins");
    rerender(<BidsAndWinsDashboard bids={bids} currentUserId="buyer" />);
    expect(tab(/Wins 1/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Complete Transaction" }).getAttribute("href")).toBe("/account/shipments#transaction-active");
  });

  it("moves an Auction that ends unsold from Active Bids to Past Bids", () => {
    render(<BidsAndWinsDashboard bids={leading()} currentUserId="buyer" />);
    end("RESERVE_NOT_MET");
    expect(tab(/Active Bids 0/)).toBeDefined();
    expect(tab(/Wins 0/)).toBeDefined();
    expect(tab(/Past Bids 1/)).toBeDefined();
  });

  it("keeps an Auction under Active Bids when someone outbids me, and shows me as outbid", () => {
    render(<BidsAndWinsDashboard bids={leading()} currentUserId="buyer" />);
    act(() => realtime.deliver("listing:active", "new-bid", {
      id: "rival", listingId: "active", userId: "rival", amount: 12500, createdAt: new Date(now).toISOString(),
      user: { name: "Rival" },
    }));
    expect(tab(/Active Bids 1/)).toBeDefined();
    expect(screen.getByText("Outbid", { selector: "span" })).toBeDefined();
    expect(stat("Leading")).toBe("Leading0");
  });
});
