// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SubmitForm from "./SubmitForm";

const mocks = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post, patch: mocks.patch } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-cloudinary", () => ({
  CldImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
  CldUploadWidget: ({ children, onSuccess }: {
    children: (props: { open: () => void }) => ReactNode;
    onSuccess: (result: { info: { secure_url: string } }) => void;
  }) => children({ open: () => onSuccess({ info: { secure_url: "https://res.cloudinary.com/demo/image/upload/car.jpg" } }) }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/submit-listing");
  mocks.post.mockImplementation(async (url, body) => ({ data: url === "/api/listing-drafts" ? { id: body.id, revision: 1, payload: body.payload, updatedAt: new Date().toISOString(), publishedListingId: null } : { id: "new-listing" } }));
  mocks.patch.mockImplementation(async (url, body) => ({ data: { id: url.split("/").at(-1), revision: body.revision + 1, payload: body.payload, updatedAt: new Date().toISOString(), publishedListingId: null } }));
});
afterEach(cleanup);

async function next(name: string) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
}

function fillDetails() {
  for (const [label, value] of [["Make", "Porsche"], ["Model", "911"], ["Year", "2020"], ["Mileage", "42000"], ["Location", "Miami, FL"], ["Description", "One-owner enthusiast vehicle."]]) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  }
  for (const [label, value] of [["Transmission", "Manual"], ["Drivetrain", "Rear-wheel drive"], ["Title status", "Unknown"]]) {
    fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
  }
}

describe("guided vehicle submission", () => {
  it("blocks fractional mileage before leaving the details step", async () => {
    render(<SubmitForm />);
    fillDetails();
    fireEvent.change(screen.getByLabelText("Mileage"), { target: { value: "1.5" } });
    await next("Continue to condition →");
    expect(screen.getByText("Please enter a valid miles.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Vehicle details" })).toBeDefined();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("validates only the active step and requires explicit disclosures before photos", async () => {
    render(<SubmitForm />);
    await next("Continue to condition →");
    expect(screen.getByText("Please select a valid transmission.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Vehicle details" })).toBeDefined();
    fillDetails();
    await next("Continue to condition →");
    expect(screen.getByRole("heading", { name: "History & condition" })).toBeDefined();
    await next("Continue to photos →");
    expect(screen.getByText("Please provide service history.")).toBeDefined();
    expect(screen.getByText("Please provide modifications.")).toBeDefined();
    expect(screen.getByText("Please provide known flaws.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add photos" })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Service history"), { target: { value: "History unknown" } });
      fireEvent.change(screen.getByLabelText("Modifications"), { target: { value: "None known" } });
      fireEvent.change(screen.getByLabelText("Known flaws"), { target: { value: "None known" } });
    });
    expect(screen.queryByText("Please provide service history.")).toBeNull();
    expect(screen.queryByText("Please provide modifications.")).toBeNull();
    expect(screen.queryByText("Please provide known flaws.")).toBeNull();
    await next("Continue to photos →");
    expect(screen.getByRole("button", { name: "Add photos" })).toBeDefined();
  });

  it("preserves edits, previews every disclosure, and submits the complete listing", async () => {
    render(<SubmitForm />);
    fillDetails();
    fireEvent.change(screen.getByLabelText("VIN or chassis number (optional)"), { target: { value: "WP0AB2997YS123456" } });
    await next("Continue to condition →");
    fireEvent.change(screen.getByLabelText("Service history"), { target: { value: "Oil service at 42,000 miles; receipts available." } });
    fireEvent.change(screen.getByLabelText("Modifications"), { target: { value: "None known" } });
    fireEvent.change(screen.getByLabelText("Known flaws"), { target: { value: "Stone chips on hood." } });
    await next("Continue to photos →");
    await next("Add photos");
    await next("Upload vehicle record");
    fireEvent.change(screen.getByLabelText("Record 1 name"), { target: { value: "Service receipt" } });
    await next("Preview listing →");
    let preview = screen.getByRole("article");
    expect(within(preview).getByText("WP0AB2997YS123456")).toBeDefined();
    expect(within(preview).getByRole("link", { name: /Service receipt/ })).toBeDefined();
    expect(within(preview).getByText("Manual")).toBeDefined();
    expect(within(preview).getByText("Rear-wheel drive")).toBeDefined();
    expect(within(preview).getByText("Unknown")).toBeDefined();
    expect(within(preview).getByText("Stone chips on hood.")).toBeDefined();
    await next("Edit condition");
    expect(screen.getByLabelText("Known flaws")).toHaveProperty("value", "Stone chips on hood.");
    fireEvent.change(screen.getByLabelText("Known flaws"), { target: { value: "Stone chips on hood. Driver’s seat bolster wear." } });
    await next("Continue to photos →");
    await next("Preview listing →");
    preview = screen.getByRole("article");
    expect(within(preview).getByText("Stone chips on hood. Driver’s seat bolster wear.")).toBeDefined();
    await next("Submit listing");
    const saved = mocks.post.mock.calls.find(([url]) => url === "/api/listing-drafts")![1];
    expect(saved.payload).toMatchObject({
      details: { vin: "WP0AB2997YS123456", transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Unknown", serviceHistory: "Oil service at 42,000 miles; receipts available.", modifications: "None known", knownFlaws: "Stone chips on hood. Driver’s seat bolster wear." },
      vehicleRecords: [{ label: "Service receipt", url: "https://res.cloudinary.com/demo/image/upload/car.jpg" }],
      images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"],
    });
    expect(mocks.post).toHaveBeenCalledWith("/api/new-listing", { draftId: saved.id, revision: 1 });
    expect(mocks.push).toHaveBeenCalledWith("/listing/new-listing");
  });
});

describe("draft resume and exit", () => {
  it("saves incomplete details and exits without publishing", async () => {
    render(<SubmitForm />);
    fireEvent.change(screen.getByLabelText("Make", { exact: true }), { target: { value: "Porsche" } });
    await next("Save & exit");
    expect(mocks.post).toHaveBeenCalledWith("/api/listing-drafts", expect.objectContaining({ payload: expect.objectContaining({ details: expect.objectContaining({ make: "Porsche", model: "" }), step: 0 }) }));
    expect(mocks.post.mock.calls.some(([url]) => url === "/api/new-listing")).toBe(false);
    expect(mocks.push).toHaveBeenCalledWith("/account/listings");
  });
  it("restores saved photos, records, checklist, step, and unfinished inputs", async () => {
    const { emptyDraftPayload } = await import("@/app/schemas/listing-draft");
    const initialDraft = {
      id: "abcdef0123456789abcdef01", revision: 4, updatedAt: new Date().toISOString(), publishedListingId: null,
      payload: { ...emptyDraftPayload, details: { ...emptyDraftPayload.details, make: "Porsche", year: "2020", knownFlaws: "Still writing this" }, images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"], vehicleRecords: [{ label: "Receipt", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" }], photoChecklist: ["exterior" as const], step: 2 },
    };
    render(<SubmitForm initialDraft={initialDraft} />);
    expect(screen.getByRole("heading", { name: "Photos" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: /Exterior/ })).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Record 1 name")).toHaveProperty("value", "Receipt");
    await next("← Edit condition");
    expect(screen.getByLabelText("Known flaws")).toHaveProperty("value", "Still writing this");
    await next("← Edit vehicle details");
    expect(screen.getByLabelText("Make", { exact: true })).toHaveProperty("value", "Porsche");
  });
});
