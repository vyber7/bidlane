// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Listing } from "@prisma/client";
import { makeListing } from "@/app/test/auction-fixtures";
import AuctionBrowser from "@/app/(site)/components/AuctionBrowser";
import AuctionSearchBrowser from "./AuctionSearchBrowser";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(
      (notify) => {
        window.addEventListener("popstate", notify);
        return () => window.removeEventListener("popstate", notify);
      },
      () => window.location.search,
    )),
  };
});

vi.mock("./Listings", () => ({
  default: ({ listings }: { listings: Listing[] }) => (
    <ul>{listings.map((listing) => <li key={listing.id}>{listing.make} {listing.model}</li>)}</ul>
  ),
}));

const listings = [
  makeListing({ id: "porsche", make: "Porsche", model: "911", currentBid: 50000 }),
  makeListing({ id: "bmw", make: "BMW", model: "M3", currentBid: 20000 }),
  makeListing({ id: "mini", make: "MINI", model: "Cooper", status: "UPCOMING" }),
];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  // Emulate Next.js notifying useSearchParams after native history updates.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((data: unknown, unused: string, url?: string | URL | null) => {
      original(data, unused, url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("URL-driven auction browsers", () => {
  it("defaults to no reserve and restores it after switching tabs", () => {
    const mixedListings = [
      makeListing({ id: "no-reserve", make: "Porsche", reservePrice: null }),
      makeListing({ id: "reserved", make: "BMW", reservePrice: 25000 }),
      makeListing({ id: "zero-reserve", make: "MINI", reservePrice: 0 }),
    ];
    render(<AuctionBrowser listings={mixedListings} />);
    const noReserve = screen.getByRole("tab", { name: /No reserve\s*1/ });
    expect(noReserve.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Porsche 911"]);

    fireEvent.click(screen.getByRole("tab", { name: /Live/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(noReserve);
    expect(new URLSearchParams(window.location.search).get("status")).toBe("no_reserve");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Porsche 911"]);

    cleanup();
    render(<AuctionBrowser listings={mixedListings} />);
    expect(screen.getByRole("tab", { name: /No reserve\s*1/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("opens a shared home view with matching controls and listings", () => {
    window.history.replaceState(null, "", "/?status=live&q=Porsche&sort=bid-high#auctions");
    render(<AuctionBrowser listings={listings} />);
    expect(screen.getByRole("tab", { name: /Live/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "Porsche");
    expect(screen.getByRole("combobox", { name: "Sort auctions" })).toHaveProperty("value", "bid-high");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Porsche 911"]);
  });

  it("updates combined URL state, preserves the hash, and restores Back/Forward selections", async () => {
    window.history.replaceState(null, "", "/?utm_source=share#auctions");
    render(<AuctionBrowser listings={listings} />);
    fireEvent.click(screen.getByRole("tab", { name: /Live/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bid-low" } });
    expect(window.location.search).toBe("?utm_source=share&status=live&sort=bid-low");
    expect(window.location.hash).toBe("#auctions");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["BMW M3", "Porsche 911"]);

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "newest"));
    expect(screen.getByRole("tab", { name: /Live/ }).getAttribute("aria-selected")).toBe("true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-low"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "BMW & MINI" } });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("BMW & MINI");
    expect(screen.getByText("No auctions found")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-low");
  });

  it.each(["live", "future", "past"])("supports shared search and sort on the %s page without overriding its status", (auctionType) => {
    window.history.replaceState(null, "", `/${auctionType}/listings?q=BMW&sort=bid-high&status=ended`);
    render(<AuctionSearchBrowser listings={listings.filter((listing) => listing.status === "LIVE")} title="Auctions" auctionType={auctionType} />);
    expect(screen.getByRole("searchbox")).toHaveProperty("value", "BMW");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["BMW M3"]);
    expect(screen.getByLabelText("1 auctions")).toBeDefined();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    expect(new URLSearchParams(window.location.search).has("sort")).toBe(false);
    expect(window.location.pathname).toBe(`/${auctionType}/listings`);
  });
});
