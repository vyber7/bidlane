// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Header from "./Header";

const useSession = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: "" }));

vi.mock("next-auth/react", () => ({ useSession, signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));
vi.mock("./NotificationBell", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  useSession.mockReset();
  searchParams.value = "";
});

it.each([
  ["status=NO_RESERVE&page=2", "No reserve", "/?status=no_reserve#auctions"],
  ["status=unrecognized", "Live auctions", "/?status=live#auctions"],
])("marks the inventory tab for a shared URL (%s)", (search, label, href) => {
  searchParams.value = search;
  useSession.mockReturnValue({ data: null });
  render(<Header />);
  fireEvent.click(screen.getByRole("button", { name: "Auctions" }));
  const link = screen.getByRole("link", { name: label });
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("aria-current")).toBe("location");
});

it("exposes desktop disclosure links and returns focus to each trigger on Escape", () => {
  useSession.mockReturnValue({ data: { user: { email: "member@example.com" } } });
  render(<Header />);

  const auctions = screen.getByRole("button", { name: "Auctions" });
  const account = screen.getByRole("button", { name: "Account menu" });
  const auctionsPanel = document.getElementById(auctions.getAttribute("aria-controls")!);
  expect(auctionsPanel?.hidden).toBe(true);
  expect(screen.queryByRole("link", { name: "Live auctions" })).toBeNull();

  fireEvent.click(auctions);
  expect(auctions.getAttribute("aria-expanded")).toBe("true");
  const live = screen.getByRole("link", { name: "Live auctions" });
  act(() => live.focus());
  fireEvent.keyDown(live, { key: "Escape" });
  expect(auctionsPanel?.hidden).toBe(true);
  expect(document.activeElement).toBe(auctions);

  fireEvent.click(auctions);
  fireEvent.click(account);
  expect(auctions.getAttribute("aria-expanded")).toBe("false");
  const profile = screen.getByRole("link", { name: "Profile" });
  act(() => profile.focus());
  fireEvent.keyDown(profile, { key: "Escape" });
  expect(account.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(account);
});

it("offers a sign-in link in both layouts and restores focus when the mobile panel closes", () => {
  useSession.mockReturnValue({ data: null });
  render(<Header />);

  const primary = screen.getByRole("navigation", { name: "Primary navigation" });
  expect(within(primary).getByRole("link", { name: "Sign In" }).getAttribute("href")).toBe("/signin");

  const trigger = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(trigger);
  const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect(mobile.id).toBe(trigger.getAttribute("aria-controls"));

  const signIn = within(mobile).getByRole("link", { name: "Sign In" });
  expect(signIn.getAttribute("href")).toBe("/signin");
  act(() => signIn.focus());
  fireEvent.keyDown(signIn, { key: "Escape" });
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("closes open disclosures when focus or an outside pointer press leaves the header", () => {
  useSession.mockReturnValue({ data: null });
  render(<><Header /><button type="button">Outside</button></>);
  const trigger = screen.getByRole("button", { name: "Auctions" });
  const outside = screen.getByRole("button", { name: "Outside" });

  fireEvent.click(trigger);
  act(() => screen.getByRole("link", { name: "Live auctions" }).focus());
  act(() => outside.focus());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(outside);

  fireEvent.click(trigger);
  fireEvent.pointerDown(outside);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
