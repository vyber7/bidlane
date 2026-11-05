// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, patch: mocks.patch } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-cloudinary", () => ({ CldImage: () => <span>Photo</span>, CldUploadWidget: () => null }));
vi.mock("@/app/submit-listing/components/RecordUploads", () => ({ default: () => <span>Records</span> }));
import ListingEditor from "./ListingEditor";
import { makeSellerListing as makeListing } from "@/app/test/auction-fixtures";
const listing = makeListing({ status: "UPCOMING", reviewStatus: "CHANGES_REQUESTED", reviewRevision: 3, images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "History unknown", modifications: "None known", knownFlaws: "Rust on fenders" });
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({ data: {} }); });

describe("seller corrections", () => {
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
