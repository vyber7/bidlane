// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AuctionBid } from "@/app/types/account";
import BidsAndWinsDashboard from "./BidsAndWinsDashboard";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(cleanup);

it("opens the Wins tab from a URL even when active bids exist", () => {
  window.history.replaceState(null, "", "/account/bids-and-wins?tab=wins");
  const win: AuctionBid = {
    id: "win", year: 2020, make: "Porsche", model: "911", location: "Miami, FL",
    coverImage: null, status: "ENDED", result: "SOLD", group: "results", currentBid: 50000,
    auctionEndsAt: null, highestBid: 50000, lastBidAt: "2026-10-14T00:10:00Z",
    bidCount: 2, isHighestBidder: true, completionHref: "/account/shipments#transaction-win",
  };
  const active: AuctionBid = { ...win, id: "active", status: "LIVE", result: null, group: "live", model: "Cayman", completionHref: null };
  render(<BidsAndWinsDashboard bids={[active, win]} />);

  const selected = screen.getByRole("tab", { name: "Wins 1", selected: true });
  expect(screen.getByRole("tabpanel").id).toBe(selected.getAttribute("aria-controls"));
  expect(screen.queryByRole("heading", { name: "2020 Porsche Cayman" })).toBeNull();
  expect(screen.getByText("Oct 14, 2026")).toBeDefined();
  expect(screen.getByRole("link", { name: "Complete Transaction" }).getAttribute("href")).toBe("/account/shipments#transaction-win");
});
