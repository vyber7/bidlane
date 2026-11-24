// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import ReviewForm from "./ReviewForm";
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.post.mockResolvedValue({ data: {} }); });

describe("moderator decisions", () => {
  it("requires actionable feedback when requesting changes", async () => {
    render(<ReviewForm id="listing" revision={3} disabled={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request Changes" })); });
    expect(screen.getByRole("alert").textContent).toContain("Explain what the seller needs to change.");
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Add clear photos of the known rust." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request Changes" })); });
    expect(mocks.post).toHaveBeenCalledWith("/api/admin/listings/listing/review", { revision: 3, decision: "CHANGES_REQUESTED", reason: "Add clear photos of the known rust." });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("submits an approval once and waits for refreshed state", async () => {
    render(<ReviewForm id="listing" revision={3} disabled={false} />);
    const approve = screen.getByRole("button", { name: "Approve Listing" });
    await act(async () => { fireEvent.click(approve); fireEvent.click(approve); });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith("/api/admin/listings/listing/review", { revision: 3, decision: "APPROVED", reason: "" });
    expect(screen.getByRole("status").textContent).toContain("Listing approved");
    expect(approve.closest("fieldset")?.disabled).toBe(true);
  });
  it("keeps feedback visible after a stale-version rejection", async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { data: { error: "This listing changed." } } });
    render(<ReviewForm id="listing" revision={3} disabled={false} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain the title." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request Changes" })); });
    expect(screen.getByRole("alert").textContent).toContain("This listing changed.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Explain the title.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("ties the missing-feedback error to the feedback field and focuses it", async () => {
    render(<ReviewForm id="listing" revision={3} disabled={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request Changes" })); });
    const feedback = screen.getByRole("textbox", { name: /Feedback/ });
    expect(feedback.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(feedback.getAttribute("aria-describedby")!)?.textContent).toContain("Explain what the seller needs to change.");
    expect(document.activeElement).toBe(feedback);
  });
});
