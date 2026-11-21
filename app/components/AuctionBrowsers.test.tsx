// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PublicListing } from "@/app/libs/listing-payload";
import { makePublicListing as makeListing } from "@/app/test/auction-fixtures";
import AuctionBrowser from "@/app/(site)/components/AuctionBrowser";

vi.mock("next/navigation", async () => {
  const { startTransition, useEffect, useState } = await import("react");
  return {
    useSearchParams: function useMockSearchParams() {
      const [search, setSearch] = useState(() => window.location.search);
      useEffect(() => {
        function syncSearch() {
          const nextSearch = window.location.search;
          startTransition(() => setSearch(nextSearch));
        }
        window.addEventListener("popstate", syncSearch);
        return () => window.removeEventListener("popstate", syncSearch);
      }, []);
      return new URLSearchParams(search);
    },
  };
});

vi.mock("./Listings", () => ({
  default: ({ listings }: { listings: PublicListing[] }) => (
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
  it("defaults to live and preserves an explicit no reserve selection", () => {
    const mixedListings = [
      makeListing({ id: "no-reserve", make: "Porsche", reservePrice: null }),
      makeListing({ id: "reserved", make: "BMW", reservePrice: 25000 }),
      makeListing({ id: "zero-reserve", make: "MINI", reservePrice: 0 }),
      makeListing({ id: "upcoming", make: "Audi", status: "UPCOMING", reservePrice: 30000 }),
    ];
    render(<AuctionBrowser listings={mixedListings} />);
    const noReserve = screen.getByRole("tab", { name: /No reserve\s*1/ });
    expect(screen.getByRole("tab", { name: /Live/ }).getAttribute("aria-selected")).toBe("true");
    expect(noReserve.getAttribute("aria-selected")).toBe("false");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(noReserve);
    expect(window.history.pushState).toHaveBeenLastCalledWith(null, "", "/?status=no_reserve");
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
    const search = screen.getByRole("searchbox", { name: /search live auctions/i });
    expect(search).toHaveProperty("value", "Porsche");
    expect(search.getAttribute("name")).toBe("q");
    expect(search.getAttribute("autocomplete")).toBe("off");
    const sort = screen.getByRole("combobox", { name: "Sort auctions" });
    expect(sort).toHaveProperty("value", "bid-high");
    expect(sort.getAttribute("name")).toBe("sort");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Porsche 911"]);
  });

  it("moves keyboard focus between tabs without selecting them until activation", () => {
    render(<AuctionBrowser listings={listings} />);
    const live = screen.getByRole("tab", { name: /Live/ });
    const upcoming = screen.getByRole("tab", { name: /Coming soon/ });
    const results = screen.getByRole("tab", { name: /Results/ });

    expect(live.tabIndex).toBe(0);
    expect(upcoming.tabIndex).toBe(-1);
    act(() => live.focus());
    expect(fireEvent.keyDown(live, { key: "ArrowLeft", altKey: true })).toBe(true);
    expect(document.activeElement).toBe(live);
    fireEvent.keyDown(live, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(results);
    fireEvent.keyDown(results, { key: "ArrowRight" });
    expect(document.activeElement).toBe(live);
    fireEvent.keyDown(live, { key: "End" });
    expect(document.activeElement).toBe(results);
    fireEvent.keyDown(results, { key: "Home" });
    expect(document.activeElement).toBe(live);
    fireEvent.keyDown(live, { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("tab", { name: /No reserve/ }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(upcoming);
    expect(upcoming.tabIndex).toBe(0);
    expect(live.tabIndex).toBe(-1);
    expect(live.getAttribute("aria-selected")).toBe("true");
    expect(window.history.pushState).not.toHaveBeenCalled();

    act(() => screen.getByRole("searchbox").focus());
    expect(live.tabIndex).toBe(0);
    expect(upcoming.tabIndex).toBe(-1);

    fireEvent.click(upcoming);
    const panel = screen.getByRole("tabpanel", { name: /Coming soon/ });
    expect(panel.id).toBe(upcoming.getAttribute("aria-controls"));
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("listitem").textContent).toBe("MINI Cooper");
  });

  it("updates the same polite status region as the search result count changes", () => {
    render(<AuctionBrowser listings={listings} />);
    const status = screen.getByRole("status");
    const search = screen.getByRole("searchbox");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Live: 2 auctions found.");
    fireEvent.change(search, { target: { value: "Porsche" } });
    expect(status.textContent).toBe("Live: 1 auction found.");
    fireEvent.change(search, { target: { value: "MINI" } });
    expect(status.textContent).toBe("Live: No auctions found.");
  });

  it("updates combined URL state, preserves the hash, and restores Back/Forward selections", async () => {
    window.history.replaceState(null, "", "/?utm_source=share#auctions");
    render(<AuctionBrowser listings={listings} />);
    fireEvent.click(screen.getByRole("tab", { name: /Live/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bid-low" } });
    expect(window.history.pushState).toHaveBeenLastCalledWith(null, "", "/?utm_source=share&status=live&sort=bid-low#auctions");
    expect(window.location.search).toBe("?utm_source=share&status=live&sort=bid-low");
    expect(window.location.hash).toBe("#auctions");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["BMW M3", "Porsche 911"]);

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "newest"));
    expect(screen.getByRole("tab", { name: /Live/ }).getAttribute("aria-selected")).toBe("true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-low"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "BMW & MINI" } });
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "/?utm_source=share&status=live&sort=bid-low&q=BMW+%26+MINI#auctions");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("BMW & MINI");
    expect(screen.getByText("No auctions found")).toBeDefined();
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveProperty("value", ""));
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveProperty("value", "BMW & MINI"));
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-low");
  });

  it.each([
    ["live", "Live", "Porsche", "Porsche 911"],
    ["upcoming", "Coming soon", "MINI", "MINI Cooper"],
    ["ended", "Results", "Audi", "Audi R8"],
  ])("opens the %s homepage filter with search and sorting", (status, label, query, expected) => {
    window.history.replaceState(null, "", `/?status=${status}&q=${query}&sort=bid-high#auctions`);
    render(<AuctionBrowser listings={[
      ...listings,
      makeListing({ id: "audi", make: "Audi", model: "R8", status: "ENDED" }),
    ]} />);
    expect(screen.getByRole("tab", { name: new RegExp(label) }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("searchbox")).toHaveProperty("value", query);
    expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-high");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([expected]);
  });
});
