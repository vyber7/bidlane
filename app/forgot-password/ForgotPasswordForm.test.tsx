// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => { const actual = await importOriginal<typeof import("axios")>(); return { ...actual, default: { ...actual.default, post: mocks.post } }; });
import ForgotPasswordForm from "./ForgotPasswordForm";
beforeEach(() => { vi.clearAllMocks(); }); afterEach(cleanup);
describe("forgot password", () => {
  it("submits a trimmed email and shows the generic confirmation", async () => {
    mocks.post.mockResolvedValueOnce({ data: { message: "If an eligible account exists, you’ll receive a reset email." } });
    const { container } = render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.post).toHaveBeenCalledWith("/api/forgot-password", { email: "user@example.com" });
    expect(screen.getByRole("status").textContent).toContain("If an eligible account exists");
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/signin");
  });
  it("preserves the email for retry after failure", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Recovery unavailable" } } });
    const { container } = render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toBe("Recovery unavailable"); expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Email address")).toHaveProperty("value", "user@example.com");
  });
  it("blocks duplicate pending submissions", async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { container } = render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "user@example.com" } });
    fireEvent.submit(container.querySelector("form")!); fireEvent.submit(container.querySelector("form")!);
    expect(mocks.post).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Requesting…" })).toHaveProperty("disabled", true);
    await act(async () => { resolve({ data: { message: "Check your inbox" } }); });
  });
});
