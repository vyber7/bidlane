// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, patch: mocks.patch } }; });
import EmailNotificationSettings from "./EmailNotificationSettings";
beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({ data: { outbidEmailsEnabled: false } }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("email notification settings", () => {
  it("saves an opt-out and confirms only after the server accepts it", async () => {
    render(<EmailNotificationSettings initialEnabled={true} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Email me when I’m outbid" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Email Preferences" })); });
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/api/account/notification-preferences", { outbidEmailsEnabled: false });
    expect(screen.getByRole("status").textContent).toBe("Email preferences saved.");
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    expect(screen.getByRole("button", { name: "Save Email Preferences" })).toHaveProperty("disabled", true);
  });
  it("saves ending-soon emails separately", async () => {
    mocks.patch.mockResolvedValue({ data: { endingSoonEmailsEnabled: false } });
    render(<EmailNotificationSettings initialEnabled={true} preference="endingSoonEmailsEnabled" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Email me when auctions are ending soon" }));
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/api/account/notification-preferences", { endingSoonEmailsEnabled: false });
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  });
  it("retains an unsaved change for retry after failure", async () => {
    mocks.patch.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Could not save" } } });
    render(<EmailNotificationSettings initialEnabled={true} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Email Preferences" })); });
    expect(screen.getByRole("alert").textContent).toBe("Could not save. Try saving again.");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("button", { name: "Save Email Preferences" })).toHaveProperty("disabled", false);
  });

  it("warns once when both preferences have unsaved changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<>
      <a href="/account/profile">Profile</a>
      <EmailNotificationSettings initialEnabled />
      <EmailNotificationSettings initialEnabled preference="endingSoonEmailsEnabled" />
    </>);
    const [outbid, endingSoon] = screen.getAllByRole("checkbox");
    fireEvent.click(outbid);
    fireEvent.click(endingSoon);
    const link = screen.getByRole("link", { name: "Profile" });
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    fireEvent.click(outbid);
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
    fireEvent.click(endingSoon);
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  });
});
