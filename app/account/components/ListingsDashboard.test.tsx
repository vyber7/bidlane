// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePublicListing, makeSellerListing } from "@/app/test/auction-fixtures";
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { serializeListing } from "@/app/utils/listing-serialization";
import ListingsDashboard from "./ListingsDashboard";

const mocks = vi.hoisted(() => ({ post: vi.fn(), router: { refresh: () => {} } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  useRouter: () => mocks.router,
}));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));
vi.mock("./AccountListingBox", () => ({
  default: ({ listing, onRemove }: { listing: { model: string }; onRemove?: () => void }) => <>
    <span>{listing.model}</span>
    {onRemove && <button type="button" onClick={onRemove}>Remove {listing.model}</button>}
  </>,
}));

function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
}

let realtime: FakeRealtime;
beforeEach(() => {
  mocks.post.mockReset();
  mocks.post.mockImplementation(async (_url, body) => ({ data: { watching: body.watching } }));
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
    uploaded={[{ ...makeSellerListing({ model: "Boxster" }), reviewLabel: "Approved" }]}
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

describe("undoing a Watchlist removal", () => {
  const first = makePublicListing({ id: "first", model: "911" });
  const second = makePublicListing({ id: "second", model: "Cayman" });
  const third = makePublicListing({ id: "third", model: "Boxster" });
  const models = () => screen.getAllByText(/^(911|Cayman|Boxster)$/).map((item) => item.textContent);
  const removal = (listing: typeof first, watching: boolean) =>
    realtime.deliver("user:buyer", "watching-update", { listing: serializeListing(listing), watching });

  beforeEach(() => window.history.replaceState(null, "", "/account/listings?tab=watching"));

  async function remove(model: string) {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: `Remove ${model}` })); });
  }
  async function undo() {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
  }

  it("restores the entry in place and watches the Auction again", async () => {
    render(<ListingsDashboard uploaded={[]} initialWatching={[first, second, third]} currentUserId="buyer" />);
    await remove("Cayman");
    expect(models()).toEqual(["911", "Boxster"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/Cayman removed from your Watchlist/)).toBeDefined();
    expect(mocks.post).toHaveBeenLastCalledWith("/api/update-watchlist", { listingId: "second", watching: false });

    await undo();
    expect(models()).toEqual(["911", "Cayman", "Boxster"]);
    expect(mocks.post).toHaveBeenLastCalledWith("/api/update-watchlist", { listingId: "second", watching: true });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("keeps one restored row when the removal and re-watch Real-time updates arrive around the undo", async () => {
    render(<ListingsDashboard uploaded={[]} initialWatching={[first, second, third]} currentUserId="buyer" />);
    await remove("Cayman");
    act(() => removal(second, false));
    expect(models()).toEqual(["911", "Boxster"]);

    await undo();
    act(() => removal(second, true));
    expect(models()).toEqual(["911", "Cayman", "Boxster"]);
  });

  it("ignores a removal Real-time update that arrives after the undo", async () => {
    render(<ListingsDashboard uploaded={[]} initialWatching={[first, second, third]} currentUserId="buyer" />);
    await remove("Cayman");
    await undo();
    act(() => removal(second, false));
    expect(models()).toEqual(["911", "Cayman", "Boxster"]);
    act(() => removal(second, true));
    expect(models()).toEqual(["911", "Cayman", "Boxster"]);
  });

  it("does not resurrect a removal that was left to expire", async () => {
    vi.useFakeTimers();
    try {
      render(<ListingsDashboard uploaded={[]} initialWatching={[first, second]} currentUserId="buyer" />);
      await remove("Cayman");
      await act(async () => { vi.advanceTimersByTime(10_000); });
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
      act(() => removal(second, false));
      expect(models()).toEqual(["911"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

it("files Watchlist Auctions under status filters by Auction phase, keeping a Closing Auction under Live", () => {
  const past = new Date(Date.now() - 60_000);
  window.history.replaceState(null, "", "/account/listings?tab=watching&status=live");
  render(<ListingsDashboard
    uploaded={[]}
    initialWatching={[
      makePublicListing({ id: "closing", model: "Closing 911", auctionEndsAt: past }),
      makePublicListing({ id: "upcoming", model: "Upcoming Cayman", status: "UPCOMING" }),
      makePublicListing({ id: "sold", model: "Sold Boxster", status: "ENDED", result: "SOLD", currentBid: 12000 }),
    ]}
  />);
  expect(screen.getByText("Closing 911")).toBeDefined();
  expect(screen.queryByText("Upcoming Cayman")).toBeNull();
  expect(screen.queryByText("Sold Boxster")).toBeNull();

  act(() => window.history.replaceState(null, "", "/account/listings?tab=watching&status=ended"));
  expect(screen.getByText("Sold Boxster")).toBeDefined();
  expect(screen.queryByText("Closing 911")).toBeNull();
});

describe("following Real-time updates", () => {
  const past = new Date(Date.now() - 60_000);
  const deliverEnded = (id: string) => act(() => {
    realtime.deliver(`listing:${id}`, "auction-ended", { auctionEndsAt: past.toISOString(), result: "SOLD" });
  });

  it("moves a watched Auction from Live to Ended when it is finalized", () => {
    window.history.replaceState(null, "", "/account/listings?tab=watching&status=live");
    render(<ListingsDashboard uploaded={[]} initialWatching={[makePublicListing({ id: "live", model: "Live 911" })]} />);
    expect(screen.getByText("Live 911")).toBeDefined();

    deliverEnded("live");
    expect(screen.queryByText("Live 911")).toBeNull();
    act(() => window.history.replaceState(null, "", "/account/listings?tab=watching&status=ended"));
    expect(screen.getByText("Live 911")).toBeDefined();
  });

  it("moves a watched Auction from Upcoming to Live when it starts", () => {
    window.history.replaceState(null, "", "/account/listings?tab=watching&status=live");
    render(<ListingsDashboard uploaded={[]} initialWatching={[makePublicListing({ id: "soon", model: "Soon Cayman", status: "UPCOMING" })]} />);
    expect(screen.queryByText("Soon Cayman")).toBeNull();

    act(() => realtime.deliver("listing:soon", "auction-started", {
      auctionStartsAt: past.toISOString(),
      auctionEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
      startingBid: 10000,
      bidIncrement: 500,
    }));
    expect(screen.getByText("Soon Cayman")).toBeDefined();
  });

  it("moves my Auction from Upcoming to Live when I start it from another tab", () => {
    window.history.replaceState(null, "", "/account/listings?status=upcoming");
    render(<ListingsDashboard
      uploaded={[{ ...makeSellerListing({ id: "mine", model: "Boxster", status: "UPCOMING" }), reviewLabel: "Approved" }]}
      initialWatching={[]}
    />);
    expect(screen.getByText("Boxster")).toBeDefined();

    act(() => realtime.deliver("listing:mine", "auction-started", {
      auctionStartsAt: past.toISOString(),
      auctionEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
      startingBid: 10000,
      bidIncrement: 500,
    }));
    expect(screen.queryByText("Boxster")).toBeNull();
    act(() => window.history.replaceState(null, "", "/account/listings?status=live"));
    expect(screen.getByText("Boxster")).toBeDefined();
  });

  it("keeps a watched Auction under Live when a new bid arrives", () => {
    window.history.replaceState(null, "", "/account/listings?tab=watching&status=live");
    render(<ListingsDashboard uploaded={[]} initialWatching={[makePublicListing({ id: "live", model: "Live 911" })]} />);
    act(() => realtime.deliver("listing:live", "new-bid", {
      id: "bid", listingId: "live", userId: "rival", amount: 12000, createdAt: new Date().toISOString(), user: { name: "Rival" },
    }));
    expect(screen.getByText("Live 911")).toBeDefined();
  });

  it("keeps the Live now count in step with my Auctions as they are finalized", () => {
    render(<ListingsDashboard
      uploaded={[{ ...makeSellerListing({ id: "mine", model: "Boxster" }), reviewLabel: "Approved" }]}
      initialWatching={[]}
    />);
    const liveNow = () => screen.getByText("Live now").parentElement!.textContent;
    expect(liveNow()).toBe("Live now1");

    deliverEnded("mine");
    expect(liveNow()).toBe("Live now0");
  });
});
