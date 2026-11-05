// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
import AuthorizedUploadButton from "./AuthorizedUploadButton";
import { MAX_UPLOAD_BYTES } from "@/app/libs/upload-policy";
beforeEach(() => { vi.clearAllMocks(); mocks.post.mockResolvedValue({ data: { url: "registered-url" } }); });
afterEach(cleanup);
describe("authorized upload control", () => {
  it("sends a multipart file and purpose to BidLane before exposing the registered URL", async () => {
    const uploaded = vi.fn(); const file = new File(["photo"], "car.jpg", { type: "image/jpeg" });
    render(<AuthorizedUploadButton kind="PHOTO" listingId="listing" onUpload={uploaded}>Add photo</AuthorizedUploadButton>);
    await act(async () => fireEvent.change(screen.getByLabelText("Choose upload files"), { target: { files: [file] } }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const [url, form] = mocks.post.mock.calls[0];
    expect(url).toBe("/api/uploads"); expect(form.get("file")).toBe(file); expect(form.get("kind")).toBe("PHOTO"); expect(form.get("listingId")).toBe("listing");
    expect(uploaded).toHaveBeenCalledWith("registered-url");
  });
  it("rejects oversized files before issuing a request", async () => {
    render(<AuthorizedUploadButton kind="RECORD" onUpload={vi.fn()}>Add record</AuthorizedUploadButton>);
    await act(async () => fireEvent.change(screen.getByLabelText("Choose upload files"), { target: { files: [new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "record.pdf")] } }));
    expect(screen.getByRole("alert").textContent).toContain("4 MB"); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("respects remaining file slots instead of silently discarding files", async () => {
    render(<AuthorizedUploadButton kind="PHOTO" maxFiles={1} onUpload={vi.fn()}>Add photo</AuthorizedUploadButton>);
    await act(async () => fireEvent.change(screen.getByLabelText("Choose upload files"), { target: { files: [new File(["1"], "1.jpg"), new File(["2"], "2.jpg")] } }));
    expect(screen.getByRole("alert").textContent).toContain("at most 1 file"); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("awaits uploads and saves sequentially and blocks a second selection while busy", async () => {
    const pending = Promise.withResolvers<{ data: { url: string } }>(); mocks.post.mockReturnValueOnce(pending.promise);
    const uploaded = vi.fn(); render(<AuthorizedUploadButton kind="PHOTO" maxFiles={2} onUpload={uploaded}>Add photos</AuthorizedUploadButton>);
    const input = screen.getByLabelText("Choose upload files"); const files = [new File(["1"], "1.jpg"), new File(["2"], "2.jpg")];
    await act(async () => fireEvent.change(input, { target: { files } }));
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    await act(async () => fireEvent.change(input, { target: { files: [files[0]] } }));
    expect(mocks.post).toHaveBeenCalledTimes(1); expect(uploaded).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { url: "first-url" } }));
    expect(mocks.post).toHaveBeenCalledTimes(2); expect(uploaded.mock.calls).toEqual([["first-url"], ["registered-url"]]);
  });
});
