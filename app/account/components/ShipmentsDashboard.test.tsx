// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ShipmentTransaction } from "@/app/types/account";
import ShipmentsDashboard from "./ShipmentsDashboard";

afterEach(cleanup);

const purchase: ShipmentTransaction = {
  id: "purchase", year: 2020, make: "Porsche", model: "911", location: "Miami, FL",
  coverImage: null, price: 50000, soldAt: "2026-10-14T12:00:00Z", role: "buyer",
  contactName: "Alex", contactEmail: "seller@example.com",
};
const sale: ShipmentTransaction = { ...purchase, id: "sale", make: "BMW", model: "M3", role: "seller", contactEmail: "buyer@example.com" };

describe("purchases and sales handoff", () => {
  it("filters purchases and sales while retaining the right counterparty contact", () => {
    render(<ShipmentsDashboard shipments={[purchase, sale]} />);
    expect(screen.getByRole("heading", { name: "Purchases & sales" })).toBeDefined();
    expect(screen.queryByText("Action needed")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Purchases 1" }));
    expect(screen.getByRole("heading", { name: "2020 Porsche 911" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "2020 BMW M3" })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact seller" }).getAttribute("href")).toMatch(/^mailto:seller@example.com\?subject=/);
    fireEvent.click(screen.getByRole("tab", { name: "Sales 1" }));
    expect(screen.getByRole("heading", { name: "2020 BMW M3" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Contact buyer" }).getAttribute("href")).toMatch(/^mailto:buyer@example.com\?subject=/);
    expect(screen.getByRole("link", { name: "After-auction guide" }).getAttribute("href")).toBe("/faq#after-auction");
  });

  it("offers support when counterparty contact details are missing", () => {
    render(<ShipmentsDashboard shipments={[{ ...purchase, contactEmail: null }]} />);
    expect(screen.queryByRole("link", { name: "Contact seller" })).toBeNull();
    expect(screen.getByRole("link", { name: "Get help" }).getAttribute("href")).toBe("/contact");
    expect(screen.getByText(/Contact details are unavailable/)).toBeDefined();
  });

  it("explains empty results without presenting a shipment status", () => {
    render(<ShipmentsDashboard shipments={[]} />);
    expect(screen.getByRole("heading", { name: "No purchases or sales yet" })).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: "Purchases 0" }));
    expect(screen.getByRole("heading", { name: "No purchases yet" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Browse live auctions" }).getAttribute("href")).toBe("/live/listings");
  });
});
