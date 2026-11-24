// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makePublicListing, makeSellerListing } from "@/app/test/auction-fixtures";
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { serializeListing } from "@/app/utils/listing-serialization";
import ListingsDashboard from "./ListingsDashboard";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
}));
vi.mock("./AccountListingBox", () => ({
  default: ({ listing }: { listing: { model: string } }) => <span>{listing.model}</span>,
}));

function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
}

let realtime: FakeRealtime;
beforeEach(() => {
  realtime = installFakeRealtime();
  for (const method of ["pushState", "replaceState"] as const) {
    const navigate = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args) => {
      navigate(...args);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }
});

afterEach(() => {
  cleanup();
  realtime.uninstall();
  vi.restoreAllMocks();
});

it("opens a filtered URL and keeps tab selection, keyboard focus, and history in sync", async () => {
  window.history.replaceState(null, "", "/account/listings?tab=watching&status=live&q=911");
  render(<ListingsDashboard
    uploaded={[makeSellerListing({ model: "Boxster" })]}
    initialWatching={[makePublicListing()]}
  />);
  const watchlist = screen.getByRole("tab", { name: /Watchlist/ });
  const vehicles = screen.getByRole("tab", { name: /My Vehicles/ });
  expect(watchlist.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").id).toBe(watchlist.getAttribute("aria-controls"));
  expect(screen.getByRole("button", { name: "Live" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("searchbox")).toHaveProperty("value", "911");
  expect(screen.getByText("911")).toBeDefined();

  watchlist.focus();
  fireEvent.keyDown(watchlist, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(vehicles);
  expect(vehicles.getAttribute("aria-selected")).toBe("true");
  expect(window.location.search).toBe("");

  await act(async () => {
    const navigated = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.back();
    await navigated;
  });
  expect(watchlist.getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("searchbox")).toHaveProperty("value", "911");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Porsche 911" } });
  expect(new URLSearchParams(window.location.search).get("q")).toBe("Porsche 911");
  expect(screen.getByText("911")).toBeDefined();
});

it("adds and removes Watchlist entries when the user watches from another tab", () => {
  window.history.replaceState(null, "", "/account/listings?tab=watching");
  const watched = makePublicListing({ id: "watched", model: "911" });
  const added = makePublicListing({ id: "added", model: "Cayman" });
  render(<ListingsDashboard uploaded={[]} initialWatching={[watched]} currentUserId="buyer" />);

  act(() => realtime.deliver("user:buyer", "watching-update", { listing: serializeListing(added), watching: true }));
  expect(screen.getByText("Cayman")).toBeDefined();
  act(() => realtime.deliver("user:buyer", "watching-update", { listing: serializeListing(watched), watching: false }));
  expect(screen.queryByText("911")).toBeNull();
  expect(screen.getByText("Cayman")).toBeDefined();
});
