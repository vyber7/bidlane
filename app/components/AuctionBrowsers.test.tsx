// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Listing } from "@prisma/client";
import { makeListing } from "@/app/test/auction-fixtures";
import AuctionBrowser from "@/app/(site)/components/AuctionBrowser";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => navigation,
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
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.push.mockImplementation((href: string) => window.history.pushState(null, "", href));
  navigation.replace.mockImplementation((href: string) => window.history.replaceState(null, "", href));
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
    expect(navigation.push).toHaveBeenLastCalledWith("/?status=no_reserve", { scroll: false });
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
    expect(navigation.push).toHaveBeenLastCalledWith("/?utm_source=share&status=live&sort=bid-low#auctions", { scroll: false });
    expect(window.location.search).toBe("?utm_source=share&status=live&sort=bid-low");
    expect(window.location.hash).toBe("#auctions");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["BMW M3", "Porsche 911"]);

    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "newest"));
    expect(screen.getByRole("tab", { name: /Live/ }).getAttribute("aria-selected")).toBe("true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveProperty("value", "bid-low"));

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "BMW & MINI" } });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.any(String), { scroll: false });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("BMW & MINI");
    expect(screen.getByText("No auctions found")).toBeDefined();
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
