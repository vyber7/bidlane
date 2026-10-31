// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  CldImage: ({ crop, ...props }: ComponentProps<"img"> & { crop?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- Exercise image load events without Cloudinary requests.
    <img {...props} alt={props.alt} data-src={props.src} data-crop={crop} />
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
  vi.restoreAllMocks();
});

describe("gallery preview loading", () => {
  const imageUrls = [savedUrl, uploadedUrl, "https://res.cloudinary.com/demo/image/upload/third.jpg", "https://res.cloudinary.com/demo/image/upload/fourth.jpg"];
  const setup = () => {
    const view = render(<Gallery listingId={listingId} vehicleName={vehicleName} initialImages={imageUrls} />);
    const dialog = view.container.querySelector("dialog")!;
    dialog.showModal = vi.fn(() => dialog.setAttribute("open", ""));
    dialog.close = vi.fn(() => {
      dialog.removeAttribute("open");
      dialog.dispatchEvent(new Event("close"));
    });
    return { ...view, dialog };
  };

  it("waits for intent before fetching previews, then warms only the pointed-to photo", () => {
    const { dialog } = setup();
    expect(dialog.querySelectorAll("img")).toHaveLength(0);

    fireEvent.pointerEnter(photos()[2]);

    const warmed = dialog.querySelector("img")!;
    expect(dialog.querySelectorAll("img")).toHaveLength(1);
    expect(warmed.getAttribute("src")).toBe(imageUrls[2]);
    expect(warmed.getAttribute("loading")).toBe("eager");
    expect(warmed.getAttribute("fetchpriority")).toBe("low");

    fireEvent.focus(photos()[1]);
    expect(dialog.querySelectorAll("img")).toHaveLength(1);
    expect(dialog.querySelector("img")!.getAttribute("src")).toBe(imageUrls[1]);
  });

  it("prioritizes the selected photo and prefetches only its neighbors with matching responsive sizes", () => {
    const { dialog } = setup();
    fireEvent.click(photos()[1]);

    const selected = within(dialog).getByRole("img", { name: `${vehicleName}, photo 2` });
    const previews = Array.from(dialog.querySelectorAll("img"));
    expect(previews).toHaveLength(3);
    expect(selected.getAttribute("fetchpriority")).toBe("high");
    expect(selected.getAttribute("loading")).toBe("eager");
    expect(selected.getAttribute("sizes")).toContain("calc(100vw - 64px)");
    expect(selected.getAttribute("data-crop")).toBe("limit");
    expect(previews.map((image) => image.getAttribute("src"))).toEqual(imageUrls.slice(0, 3));
    expect(previews.every((image) => image.getAttribute("sizes") === selected.getAttribute("sizes"))).toBe(true);

    const nextImage = previews[2];
    fireEvent.load(nextImage);
    fireEvent.click(within(dialog).getByRole("button", { name: "Next →" }));

    expect(within(dialog).getByRole("img", { name: `${vehicleName}, photo 3` })).toBe(nextImage);
    expect(nextImage.className).not.toContain("opacity-0");
    expect(nextImage.getAttribute("fetchpriority")).toBe("high");
    expect(Array.from(dialog.querySelectorAll("img")).map((image) => image.getAttribute("src"))).toEqual(imageUrls.slice(1, 4));
  });

  it("shows the cached thumbnail immediately and replaces it after the preview loads", () => {
    const { dialog } = setup();
    const thumbnail = within(photos()[0]).getByRole("img");
    Object.defineProperty(thumbnail, "currentSrc", { value: `${savedUrl}?thumbnail=320` });
    fireEvent.load(thumbnail);
    fireEvent.click(photos()[0]);

    const selected = within(dialog).getByRole("img", { name: `${vehicleName}, photo 1` });
    expect(dialog.querySelector('img[alt=""]')!.getAttribute("src")).toBe(`${savedUrl}?thumbnail=320`);
    expect(selected.className).toContain("opacity-0");
    fireEvent.load(selected);
    expect(selected.className).not.toContain("opacity-0");
    expect(dialog.querySelector(`img[src="${savedUrl}?thumbnail=320"]`)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close ×" }));
    expect(dialog.querySelectorAll("img")).toHaveLength(0);
  });

  it("keeps the thumbnail visible when a full-size photo fails", () => {
    const { dialog } = setup();
    fireEvent.load(within(photos()[0]).getByRole("img"));
    fireEvent.click(photos()[0]);
    fireEvent.error(within(dialog).getByRole("img", { name: `${vehicleName}, photo 1` }));

    expect(within(dialog).getByRole("status").textContent).toContain("Showing thumbnail");
    expect(dialog.querySelector('img[alt=""]')!.getAttribute("src")).toBe(savedUrl);
  });
});

const photos = () => screen.queryAllByRole("button", { name: /^View photo/ });
const upload = () => fireEvent.click(screen.getByRole("button", { name: "Add Images" }));

describe("gallery image data", () => {
  it("renders all 20 photos and hides uploads when the gallery is full", () => {
    const images = Array.from({ length: 20 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/photo-${i}.jpg`);
    render(<Gallery listingId={listingId} initialImages={images} owner />);
    expect(photos()).toHaveLength(20);
    expect(screen.getByText("20 photos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Images" })).toBeNull();
  });
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
