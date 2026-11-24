// @vitest-environment jsdom
import { StrictMode } from "react";
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), signOut: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, post: mocks.post } }; });
vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));
import ResetPasswordForm from "./ResetPasswordForm";
const token = "a".repeat(64);
function fill(password = "a long password", confirm = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("TextEncoder", TextEncoder); mocks.signOut.mockResolvedValue({ url: "/signin" });
  window.history.replaceState(null, "", `/reset-password#token=${token}`);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function expectFieldError(field: HTMLElement, message: string) {
  expect(field.getAttribute("aria-invalid")).toBe("true");
  const ids = (field.getAttribute("aria-describedby") ?? "").split(" ");
  expect(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ")).toContain(message);
}
describe("password reset form", () => {
  it("does not consume the link on load and captures its fragment once in StrictMode", async () => {
    mocks.post.mockResolvedValueOnce({ data: { success: true } });
    const { container } = render(<StrictMode><ResetPasswordForm /></StrictMode>);
    expect(mocks.post).not.toHaveBeenCalled(); expect(window.location.hash).toBe("");
    fill();
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.post).toHaveBeenCalledWith("/api/reset-password", { token, password: "a long password", confirmPassword: "a long password" });
    expect(screen.getByRole("status").textContent).toContain("password has been changed");
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(screen.getByRole("link", { name: "Sign In" }).getAttribute("href")).toBe("/signin");
  });
  it.each([["short", "short", "at least 12"], ["é".repeat(36) + "a", "é".repeat(36) + "a", "no more than 72 bytes"], ["a long password", "different password", "do not match"]])("validates password and confirmation before submitting", async (password, confirm, message) => {
    const { container } = render(<ResetPasswordForm />); fill(password, confirm);
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain(message); expect(mocks.post).not.toHaveBeenCalled();
  });
  it("preserves fields and token for a retry, and offers a new-link path", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "This link has expired" } } });
    const { container } = render(<ResetPasswordForm />); fill();
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain("expired");
    expect(screen.getByLabelText("New password")).toHaveProperty("value", "a long password");
    expect(screen.getByRole("link", { name: "Request a New Reset Link" }).getAttribute("href")).toBe("/forgot-password");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it.each(["", "#token=bad"])("handles missing or malformed fragments without sending requests", (fragment) => {
    window.history.replaceState(null, "", `/reset-password${fragment}`); render(<ResetPasswordForm />);
    expect(screen.queryByRole("button", { name: "Reset Password" })).toBeNull(); expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Request a New Reset Link" })).toBeDefined();
  });
  it("lists every problem next to its field and focuses the first one", async () => {
    const { container } = render(<ResetPasswordForm />);
    fill("short", "different");
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    const password = screen.getByLabelText("New password");
    expectFieldError(password, "at least 12");
    expectFieldError(screen.getByLabelText("Confirm new password"), "do not match");
    expect(document.activeElement).toBe(password);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
