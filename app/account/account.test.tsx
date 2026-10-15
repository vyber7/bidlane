// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AccountLayout from "./layout";
import AccountLinks from "./components/AccountLinks";
import Profile from "./profile/page";
import Listings from "./listings/page";
import BidsAndWins from "./bids-and-wins/page";
import Notifications from "./notifications/page";
import Shipments from "./shipments/page";

const mocks = vi.hoisted(() => ({
  getAccountUser: vi.fn(),
  findListings: vi.fn(),
  findBids: vi.fn(),
  pathname: "/account/profile",
}));

vi.mock("./lib/current-user", () => ({ getAccountUser: mocks.getAccountUser }));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: { findMany: mocks.findListings },
    bid: { findMany: mocks.findBids },
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("./components/ProfileEditor", () => ({ default: () => null }));
vi.mock("./components/ListingsDashboard", () => ({ default: () => null }));
vi.mock("./components/BidsAndWinsDashboard", () => ({ default: () => null }));
vi.mock("./components/NotificationsCenter", () => ({ default: () => null }));
vi.mock("./components/ShipmentsDashboard", () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/account/profile";
  mocks.getAccountUser.mockResolvedValue({
    id: "driver", name: "Alex Driver", email: "alex@example.com",
    image: null, createdAt: new Date("2026-10-14T12:00:00Z"), hasPassword: true,
  });
});

afterEach(cleanup);

describe("shared account layout", () => {
  it("renders one greeting, the account navigation, and the page content", async () => {
    render(await AccountLayout({ children: <h2>Account content</h2> }));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Welcome back, Alex." })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "Account content" })).toBeTruthy();
  });

  it("keeps the active navigation link in sync when the pathname changes", () => {
    const { rerender } = render(<AccountLinks />);
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe("page");

    mocks.pathname = "/account/notifications";
    rerender(<AccountLinks />);

    expect(screen.getByRole("link", { name: "Profile" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByRole("link", { name: "Notifications" }).getAttribute("aria-current")).toBe("page");
  });

  it("shows a shared sign-in fallback without exposing page content", async () => {
    mocks.getAccountUser.mockResolvedValue(null);
    render(await AccountLayout({ children: <h2>Private account data</h2> }));

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/signin");
    expect(screen.queryByText("Private account data")).toBeNull();
  });
});

describe("account page authentication", () => {
  // The persistent layout must not be the only check before a page loads data.
  it.each([
    ["profile", Profile],
    ["listings", Listings],
    ["bids and wins", BidsAndWins],
    ["notifications", Notifications],
    ["shipments", Shipments],
  ])("checks the user independently on %s", async (_name, page) => {
    mocks.getAccountUser.mockResolvedValue(null);

    expect(await page()).toBeNull();
    expect(mocks.findListings).not.toHaveBeenCalled();
    expect(mocks.findBids).not.toHaveBeenCalled();
  });
});
