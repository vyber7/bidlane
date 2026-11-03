// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, post: mocks.post } }; });
import EmailVerification from "./EmailVerification";
beforeEach(() => { vi.clearAllMocks(); }); afterEach(cleanup);
describe("profile email verification", () => {
  it("requests a verification email and explains the inbox-only badge", async () => {
    mocks.post.mockResolvedValueOnce({ data: { sent: true } }); render(<EmailVerification verified={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send verification email" })); });
    expect(mocks.post).toHaveBeenCalledWith("/api/account/verify-email");
    expect(screen.getByRole("status").textContent).toContain("Check your inbox");
    expect(screen.getByText(/email address stays private/)).toBeDefined();
  });
  it("reports resend limits without claiming delivery", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Please wait one minute" } } });
    render(<EmailVerification verified={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send verification email" })); });
    expect(screen.getByRole("alert").textContent).toBe("Please wait one minute"); expect(screen.queryByRole("status")).toBeNull();
  });
  it("handles verification completed in another tab without claiming another email was sent", async () => {
    mocks.post.mockResolvedValueOnce({ data: { verified: true } }); render(<EmailVerification verified={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send verification email" })); });
    expect(screen.getByRole("status").textContent).toBe("Your email is already verified.");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows a verified account without offering another email", () => {
    render(<EmailVerification verified />); expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/does not verify your identity/)).toBeDefined();
  });
});
