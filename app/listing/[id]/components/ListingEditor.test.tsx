// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, patch: mocks.patch } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-cloudinary", () => ({ CldImage: () => <span>Photo</span> }));
vi.mock("@/app/submit-listing/components/RecordUploads", () => ({ default: () => <span>Records</span> }));
import ListingEditor from "./ListingEditor";
import { makeSellerListing as makeListing } from "@/app/test/auction-fixtures";
const listing = makeListing({ status: "UPCOMING", reviewStatus: "CHANGES_REQUESTED", reviewRevision: 3, images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "History unknown", modifications: "None known", knownFlaws: "Rust on fenders" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({ data: {} }); });

describe("seller corrections", () => {
  it("links inline validation errors and focuses the first invalid control", async () => {
    const { container } = render(<ListingEditor listing={listing} />);
    container.querySelector("details")!.open = true;
    const make = screen.getByLabelText("Make");
    const description = screen.getByLabelText("Description");
    fireEvent.change(make, { target: { value: "" } });
    fireEvent.change(description, { target: { value: "" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });

    expect(make.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(make.getAttribute("aria-describedby")!)?.textContent).toContain("enter a make");
    expect(document.getElementById(description.getAttribute("aria-describedby")!)?.textContent).toContain("enter a description");
    expect(document.activeElement).toBe(make);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("guards unsaved changes until they are reverted or successfully saved", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(<>
      <a href="/account/listings">My listings</a>
      <ListingEditor listing={listing} />
    </>);
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    const original = description.value;
    const canUnload = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(canUnload()).toBe(true);

    fireEvent.change(description, { target: { value: "My edit" } });
    expect(canUnload()).toBe(false);
    expect(fireEvent.click(screen.getByRole("link", { name: "My listings" }))).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();

    fireEvent.change(description, { target: { value: original } });
    expect(canUnload()).toBe(true);
    fireEvent.change(description, { target: { value: "Save my edit" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(canUnload()).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("resubmits a complete corrected listing with its original revision", async () => {
    const { container } = render(<ListingEditor listing={listing} />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Rust documented in the photos." } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.patch).toHaveBeenCalledWith(`/api/listing/${listing.id}`, expect.objectContaining({ revision: 3, data: expect.objectContaining({ description: "Rust documented in the photos.", knownFlaws: "Rust on fenders", images: listing.images }) }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps unsaved corrections after an API conflict", async () => {
    mocks.patch.mockRejectedValue({ isAxiosError: true, response: { data: { error: "This listing changed. Reload before editing again." } } });
    const { container } = render(<ListingEditor listing={listing} />);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "My correction" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert", { hidden: true }).textContent).toContain("This listing changed.");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("My correction");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
