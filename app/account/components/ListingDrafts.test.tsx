// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, delete: mocks.remove } }; });
import ListingDrafts from "./ListingDrafts";
const draft = { id: "draft-one", revision: 3, title: "2020 Porsche 911", photoCount: 4, updatedAt: "2026-11-03T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); }); afterEach(cleanup);

function openDeleteDialog() {
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  const trigger = screen.getByRole("button", { name: /Delete Draft/ });
  fireEvent.click(trigger);
  return { dialog: within(screen.getByRole("dialog", { name: "Delete This Draft?" })), trigger };
}

describe("saved draft management", () => {
  it("shows each draft's photo count and save time in the shared formats", () => {
    render(<ListingDrafts drafts={[draft, { ...draft, id: "draft-two", photoCount: 1, updatedAt: "2026-11-24T23:30:00Z" }]} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first.textContent).toContain("4 photos · Saved Nov 3, 2026, 12:00 PM UTC");
    expect(second.textContent).toContain("1 photo · Saved Nov 24, 2026, 11:30 PM UTC");
  });
  it("links to the correct private resume URL and waits for confirmation before deleting", async () => {
    mocks.remove.mockResolvedValueOnce({ data: { deleted: true } }); render(<ListingDrafts drafts={[draft]} />);
    expect(screen.getByRole("link", { name: "Resume Draft" }).getAttribute("href")).toBe("/submit-listing?draft=draft-one");
    const { dialog } = openDeleteDialog();
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(dialog.getByRole("button", { name: "Delete Draft" })); });
    expect(mocks.remove).toHaveBeenCalledWith("/api/listing-drafts/draft-one", { data: { revision: 3 } }); expect(screen.queryByText(draft.title)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Start a New Draft" }));
    expect(screen.getByRole("status").textContent).toBe("Draft deleted.");
  });
  it("focuses Cancel first and returns focus when Escape dismisses the dialog", () => {
    render(<ListingDrafts drafts={[draft]} />);
    const { dialog, trigger } = openDeleteDialog();
    expect(document.activeElement).toBe(dialog.getByRole("button", { name: "Cancel" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("keeps a draft visible when deletion conflicts with another device’s save", async () => {
    mocks.remove.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Draft changed" } } }); render(<ListingDrafts drafts={[draft]} />);
    const { dialog } = openDeleteDialog();
    await act(async () => { fireEvent.click(dialog.getByRole("button", { name: "Delete Draft" })); });
    expect(screen.getByRole("heading", { name: draft.title })).toBeDefined();
    expect(dialog.getByRole("alert").textContent).toContain("Draft changed");
  });
  it("uses refreshed server summaries without hiding new drafts", () => {
    const { rerender } = render(<ListingDrafts drafts={[]} />);
    rerender(<ListingDrafts drafts={[draft]} />); expect(screen.getByText(draft.title)).toBeDefined();
  });
});
