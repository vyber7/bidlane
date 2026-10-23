// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import VehicleHistory from "./VehicleHistory";

afterEach(cleanup);

describe("buyer-facing history and condition", () => {
  it("makes missing legacy disclosures explicit without claiming a clean condition", () => {
    render(<VehicleHistory details={{}} />);
    expect(screen.getAllByText("Not provided")).toHaveLength(3);
    expect(screen.queryByText("None known")).toBeNull();
  });

  it("shows seller-reported disclosures as text, preserving lines and known flaws", () => {
    render(<VehicleHistory details={{ serviceHistory: "Oil service\nReceipts available", modifications: "None known", knownFlaws: "<script>warning</script>\nStone chips" }} id="condition" />);
    expect(screen.getByText("Oil service Receipts available")).toBeDefined();
    expect(screen.getByText("<script>warning</script> Stone chips")).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/Reported by the seller/)).toBeDefined();
  });
});
