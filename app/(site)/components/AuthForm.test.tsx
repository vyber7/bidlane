// @vitest-environment jsdom
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), signIn: vi.fn(), push: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("next-auth/react", () => ({ signIn: mocks.signIn, useSession: () => ({ status: "unauthenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-hot-toast", () => ({ toast: { error: mocks.error, success: mocks.success } }));

import AuthForm from "./AuthForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("TextEncoder", TextEncoder);
  mocks.post.mockResolvedValue({ data: { id: "user" } });
  mocks.signIn.mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fill(password: string) {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "driver@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

describe("password requirements in the authentication form", () => {
  it.each([
    ["a", "Use at least 12 characters."],
    ["é".repeat(36) + "a", "Use no more than 72 bytes."],
    ["😀".repeat(18) + "a", "Use no more than 72 bytes."],
  ])("blocks registration before submitting an invalid password: %s", async (password, message) => {
    const { container } = render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Driver" } });
    fill(password);
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(12), "é".repeat(36), "😀".repeat(18), " long secret "])("registers with the exact valid password: %s", async (password) => {
    const { container } = render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByText(/Use at least 12 characters and no more than 72/)).toBeDefined();
    expect(screen.getByLabelText("Password")).toHaveProperty("minLength", 12);
    expect(screen.getByLabelText("Password")).toHaveProperty("maxLength", 72);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Driver" } });
    fill(password);
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.post).toHaveBeenCalledWith("/api/register", { name: "Driver", email: "driver@example.com", password });
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { name: "Driver", email: "driver@example.com", password });
  });

  it("allows legacy short passwords at sign-in without imposing the new-password minimum", async () => {
    const { container } = render(<AuthForm />);
    fill("a");
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ password: "a", redirect: false }));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("rejects passwords over 72 UTF-8 bytes at sign-in", async () => {
    const { container } = render(<AuthForm />);
    fill("é".repeat(36) + "a");
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain("Use no more than 72 bytes.");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
