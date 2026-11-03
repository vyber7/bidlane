// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, delete: mocks.remove } }; });
import ListingDrafts from "./ListingDrafts";
const draft = { id: "draft-one", revision: 3, title: "2020 Porsche 911", photoCount: 4, updatedAt: "2026-11-03T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); }); afterEach(cleanup);
describe("saved draft management", () => {
  it("links to the correct private resume URL and waits for confirmation before deleting", async () => {
    mocks.remove.mockResolvedValueOnce({ data: { deleted: true } }); render(<ListingDrafts drafts={[draft]} />);
    expect(screen.getByRole("link", { name: "Resume draft" }).getAttribute("href")).toBe("/submit-listing?draft=draft-one");
    fireEvent.click(screen.getByRole("button", { name: /Delete draft/ })); expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete" })); });
    expect(mocks.remove).toHaveBeenCalledWith("/api/listing-drafts/draft-one", { data: { revision: 3 } }); expect(screen.queryByText(draft.title)).toBeNull();
  });
  it("keeps a draft visible when deletion conflicts with another device’s save", async () => {
    mocks.remove.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Draft changed" } } }); render(<ListingDrafts drafts={[draft]} />);
    fireEvent.click(screen.getByRole("button", { name: /Delete draft/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete" })); });
    expect(screen.getByText(draft.title)).toBeDefined(); expect(screen.getByRole("alert").textContent).toContain("Draft changed");
  });
  it("uses refreshed server summaries without hiding new drafts", () => {
    const { rerender } = render(<ListingDrafts drafts={[]} />);
    rerender(<ListingDrafts drafts={[draft]} />); expect(screen.getByText(draft.title)).toBeDefined();
  });
});
