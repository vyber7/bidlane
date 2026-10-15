// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Gallery from "./Gallery";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  fetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

const listingId = "abcdef0123456789abcdef01";
const uploadedUrl = `https://res.cloudinary.com/demo/image/upload/listing-${listingId}/new.jpg`;
const savedUrl = "https://res.cloudinary.com/demo/image/upload/saved.jpg";
const vehicleName = "2020 Porsche 911";

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("react-hot-toast", () => ({
  default: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next-cloudinary", () => ({
  CldImage: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
  CldUploadButton: ({ onSuccess, children }: {
    onSuccess: (result: { info: { secure_url: string } }) => void;
    children: ReactNode;
  }) => (
    <button onClick={() => onSuccess({ info: { secure_url: uploadedUrl } })}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.post.mockResolvedValue({ data: { imageUrl: uploadedUrl } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photos = () => screen.queryAllByRole("button", { name: /^View photo/ });
const upload = () => fireEvent.click(screen.getByRole("button", { name: "Add Images" }));

describe("gallery image data", () => {
  it("renders unique server photos immediately without another image-list request", () => {
    render(<Gallery listingId={listingId} vehicleName={vehicleName} initialImages={[savedUrl, savedUrl]} />);

    expect(photos()).toHaveLength(1);
    expect(screen.getByText("1 photos")).toBeTruthy();
    expect(screen.getByRole("img", { name: `${vehicleName}, photo 1` }).getAttribute("data-src")).toBe(savedUrl);
    expect(screen.queryByText("Loading images…")).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("uses refreshed server photos without keeping the previous prop values in state", () => {
    const { rerender } = render(<Gallery listingId={listingId} initialImages={[savedUrl]} />);
    const refreshedUrl = "https://res.cloudinary.com/demo/image/upload/refreshed.jpg";

    rerender(<Gallery listingId={listingId} initialImages={[refreshedUrl]} />);

    expect(photos()).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Vehicle, photo 1" }).getAttribute("data-src")).toBe(refreshedUrl);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([true, false])("shows an empty gallery immediately (owner: %s)", (owner) => {
    render(<Gallery listingId={listingId} initialImages={[]} owner={owner} />);

    expect(screen.getByText("No additional photos yet.")).toBeTruthy();
    expect(photos()).toHaveLength(0);
    expect(Boolean(screen.queryByRole("button", { name: "Add Images" }))).toBe(owner);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("adds an uploaded photo only after its listing write succeeds", async () => {
    const saved = Promise.withResolvers<{ data: object }>();
    mocks.post.mockReturnValueOnce(saved.promise);
    render(<Gallery listingId={listingId} initialImages={[savedUrl]} owner />);

    upload();
    expect(photos()).toHaveLength(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledWith("/api/cloudinary-images", { listingId, imageUrl: uploadedUrl });

    await act(async () => { saved.resolve({ data: {} }); });

    expect(photos()).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Vehicle, photo 2" }).getAttribute("data-src")).toBe(uploadedUrl);
    expect(mocks.success).toHaveBeenCalledWith("Image uploaded successfully!");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("deduplicates successful uploads when the server props catch up", async () => {
    const { rerender } = render(<Gallery listingId={listingId} initialImages={[savedUrl]} owner />);
    await act(async () => { upload(); });
    await act(async () => { upload(); });
    rerender(<Gallery listingId={listingId} initialImages={[savedUrl, uploadedUrl]} owner />);

    expect(photos()).toHaveLength(2);
    expect(screen.getByText("2 photos")).toBeTruthy();
  });

  it("preserves saved photos and explains a rejected upload", async () => {
    mocks.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: "This listing already has the maximum number of images" } },
    });
    render(<Gallery listingId={listingId} initialImages={[savedUrl]} owner />);
    await act(async () => { upload(); });

    expect(photos()).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Vehicle, photo 1" }).getAttribute("data-src")).toBe(savedUrl);
    expect(mocks.error).toHaveBeenCalledWith("This listing already has the maximum number of images");
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
