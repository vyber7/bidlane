// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SubmitForm from "./SubmitForm";

const mocks = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
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
  mocks.post.mockResolvedValue({ data: { id: "new-listing" } });
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
  it("validates only the active step and requires explicit disclosures before photos", async () => {
    render(<SubmitForm />);
    await next("Continue to condition →");
    expect(screen.getByText("Please select a transmission.")).toBeDefined();
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
    await next("Continue to condition →");
    fireEvent.change(screen.getByLabelText("Service history"), { target: { value: "Oil service at 42,000 miles; receipts available." } });
    fireEvent.change(screen.getByLabelText("Modifications"), { target: { value: "None known" } });
    fireEvent.change(screen.getByLabelText("Known flaws"), { target: { value: "Stone chips on hood." } });
    await next("Continue to photos →");
    await next("Add photos");
    await next("Preview listing →");
    let preview = screen.getByRole("article");
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
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/api/new-listing", { data: expect.objectContaining({
      transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Unknown",
      serviceHistory: "Oil service at 42,000 miles; receipts available.", modifications: "None known",
      knownFlaws: "Stone chips on hood. Driver’s seat bolster wear.",
      images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"],
    }) });
    expect(mocks.push).toHaveBeenCalledWith("/listing/new-listing");
  });
});
