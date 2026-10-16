// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, patch: mocks.patch } }; });
import EmailNotificationSettings from "./EmailNotificationSettings";
beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({ data: { outbidEmailsEnabled: false } }); });
afterEach(cleanup);
describe("email notification settings", () => {
  it("saves an opt-out and confirms only after the server accepts it", async () => {
    render(<EmailNotificationSettings initialEnabled={true} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Email me when I’m outbid" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save email preferences" })); });
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/api/account/notification-preferences", { outbidEmailsEnabled: false });
    expect(screen.getByRole("status").textContent).toBe("Email preferences saved.");
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    expect(screen.getByRole("button", { name: "Save email preferences" })).toHaveProperty("disabled", true);
  });
  it("retains an unsaved change for retry after failure", async () => {
    mocks.patch.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Could not save" } } });
    render(<EmailNotificationSettings initialEnabled={true} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save email preferences" })); });
    expect(screen.getByRole("alert").textContent).toBe("Could not save");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Save email preferences" })).toHaveProperty("disabled", false);
  });
});
