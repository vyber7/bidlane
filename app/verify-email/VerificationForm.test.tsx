// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, post: mocks.post } }; });
import VerificationForm from "./VerificationForm";
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", `/verify-email#token=${"a".repeat(64)}`); });
afterEach(cleanup);
describe("verification link", () => {
  it("does not consume a link on load, clears the fragment, and works in StrictMode", async () => {
    mocks.post.mockResolvedValue({ data: { verified: true } });
    render(<StrictMode><VerificationForm /></StrictMode>);
    expect(window.location.hash).toBe(""); expect(mocks.post).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify email address" })); });
    expect(mocks.post).toHaveBeenCalledWith("/api/verify-email", { token: "a".repeat(64) });
    expect(screen.getByRole("status").textContent).toContain("confirmed access");
  });
  it("preserves the token for retry if the server fails", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Expired link" } } });
    render(<VerificationForm />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify email address" })); });
    expect(screen.getByRole("alert").textContent).toBe("Expired link");
    expect(screen.getByRole("button", { name: "Verify email address" })).toHaveProperty("disabled", false);
  });
  it("offers a recovery path for missing tokens", () => {
    window.history.replaceState(null, "", "/verify-email"); render(<VerificationForm />);
    expect(screen.getByRole("button", { name: "Verify email address" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("link", { name: "Go to profile" }).getAttribute("href")).toBe("/account/profile");
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
