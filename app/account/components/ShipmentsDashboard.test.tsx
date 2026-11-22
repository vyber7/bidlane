// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipmentTransaction } from "@/app/types/account";
import { transactionCompletion } from "@/app/libs/transaction-completion";
import ShipmentsDashboard from "./ShipmentsDashboard";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
}));

function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/account/shipments");
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    push(...args);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const purchase: ShipmentTransaction = {
  id: "purchase", year: 2020, make: "Porsche", model: "911", location: "Miami, FL",
  coverImage: null, price: 50000, soldAt: "2026-10-14T12:00:00Z", role: "buyer",
  contactName: "Alex", contactEmail: "seller@example.com",
  completion: null,
};
const sale: ShipmentTransaction = { ...purchase, id: "sale", make: "BMW", model: "M3", role: "seller", contactEmail: "buyer@example.com" };

describe("purchases and sales handoff", () => {
  it("shows the saved shared checklist at the transaction's linked anchor", async () => {
    const completion = transactionCompletion({ paymentBuyerConfirmedAt: new Date("2026-11-14T12:00:00Z") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ role: "buyer", completion })));
    render(<ShipmentsDashboard shipments={[{ ...purchase, completion }]} />);
    expect(await screen.findByRole("region", { name: "Shared completion checklist" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Confirm payment as buyer" })).toHaveProperty("checked", true);
    expect(document.getElementById("transaction-purchase")).not.toBeNull();
  });

  it("filters purchases and sales while retaining the right counterparty contact", () => {
    render(<ShipmentsDashboard shipments={[purchase, sale]} />);
    expect(screen.getByRole("heading", { name: "Purchases & Sales" })).toBeDefined();
    expect(screen.queryByText("Action needed")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Purchases 1" }));
    expect(screen.getByRole("heading", { name: "2020 Porsche 911" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "2020 BMW M3" })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact Seller" }).getAttribute("href")).toMatch(/^mailto:seller@example.com\?subject=/);
    const purchases = screen.getByRole("tab", { name: "Purchases 1" });
    const sales = screen.getByRole("tab", { name: "Sales 1" });
    purchases.focus();
    fireEvent.keyDown(purchases, { key: "ArrowRight" });
    expect(document.activeElement).toBe(sales);
    expect(window.location.search).toBe("?tab=sales");
    expect(screen.getByRole("tabpanel").id).toBe(sales.getAttribute("aria-controls"));
    expect(screen.getByRole("heading", { name: "2020 BMW M3" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Contact Buyer" }).getAttribute("href")).toMatch(/^mailto:buyer@example.com\?subject=/);
    expect(screen.getByRole("link", { name: "After-Auction Guide" }).getAttribute("href")).toBe("/faq#after-auction");
  });

  it("offers support when counterparty contact details are missing", () => {
    render(<ShipmentsDashboard shipments={[{ ...purchase, contactEmail: null }]} />);
    expect(screen.queryByRole("link", { name: "Contact Seller" })).toBeNull();
    expect(screen.getByRole("link", { name: "Get Help" }).getAttribute("href")).toBe("/contact");
    expect(screen.getByText(/Contact details are unavailable/)).toBeDefined();
  });

  it("explains empty results without presenting a shipment status", () => {
    render(<ShipmentsDashboard shipments={[]} />);
    expect(screen.getByRole("heading", { name: "No Purchases or Sales Yet" })).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: "Purchases 0" }));
    expect(screen.getByRole("heading", { name: "No Purchases Yet" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Browse Live Auctions" }).getAttribute("href")).toBe("/?status=live#auctions");
  });
});
