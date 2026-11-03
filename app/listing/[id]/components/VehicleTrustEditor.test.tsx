// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, patch: mocks.patch } }; });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/submit-listing/components/RecordUploads", () => ({ default: () => null }));
import VehicleTrustEditor from "./VehicleTrustEditor";
beforeEach(() => { vi.clearAllMocks(); }); afterEach(cleanup);
describe("seller vehicle evidence editor", () => {
  it("saves existing record references and refreshes the public listing", async () => {
    const records = [{ label: "Receipt", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" }];
    mocks.patch.mockResolvedValueOnce({ data: { saved: true } });
    render(<VehicleTrustEditor id="car" initialVin={null} initialRecords={records} />);
    fireEvent.change(screen.getByLabelText("VIN or chassis number (optional)"), { target: { value: "BCNR33-012345" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save VIN & records" })); });
    expect(mocks.patch).toHaveBeenCalledWith("/api/listing/car/vehicle-details", { vin: "BCNR33-012345", vehicleRecords: records });
    expect(mocks.refresh).toHaveBeenCalled(); expect(screen.getByRole("status").textContent).toContain("saved");
  });
  it("retains edits and displays auction-start conflicts", async () => {
    mocks.patch.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "The auction changed. Refresh before editing." } } });
    render(<VehicleTrustEditor id="car" initialVin="ABC123" initialRecords={null} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save VIN & records" })); });
    expect(screen.getByRole("alert").textContent).toContain("auction changed");
    expect(screen.getByLabelText("VIN or chassis number (optional)")).toHaveProperty("value", "ABC123");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
