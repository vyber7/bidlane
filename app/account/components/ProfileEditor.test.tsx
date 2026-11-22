// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileEditor from "./ProfileEditor";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, patch: mocks.patch } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const user = {
  name: "Alex Driver",
  email: "alex@example.com",
  image: "",
  createdAt: "2026-11-01T00:10:00Z",
  hasPassword: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

it("focuses the name field and links its inline validation error", () => {
  render(<ProfileEditor user={user} />);
  expect(screen.getByText("November 2026")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
  const name = screen.getByRole("textbox", { name: "Full name" });
  expect(document.activeElement).toBe(name);
  fireEvent.change(name, { target: { value: "" } });
  const save = screen.getByRole("button", { name: "Save Changes" });
  save.focus();
  fireEvent.click(save);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(name.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  expect(document.activeElement).toBe(name);
  expect(mocks.patch).not.toHaveBeenCalled();

  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Profile" }));
});

it("announces a successful save and returns focus to Edit Profile", async () => {
  render(<ProfileEditor user={user} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Full name" }), { target: { value: "Alex Smith" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/api/account/profile", { name: "Alex Smith", image: "" });
  expect(screen.getByRole("status").textContent).toBe("Profile updated.");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Profile" }));
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
});
