// @vitest-environment jsdom
import { TextEncoder } from "node:util";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), signIn: vi.fn(), useSession: vi.fn(), push: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
vi.mock("next-auth/react", () => ({ signIn: mocks.signIn, useSession: mocks.useSession }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-hot-toast", () => ({ toast: { error: mocks.error, success: mocks.success } }));

import AuthForm from "./AuthForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("TextEncoder", TextEncoder);
  mocks.post.mockResolvedValue({ data: { id: "user" } });
  mocks.signIn.mockResolvedValue({ ok: true });
  mocks.useSession.mockReturnValue({ status: "unauthenticated" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fill(password: string) {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "driver@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

describe("password requirements in the authentication form", () => {
  it("keeps the requested listing anchor through credential sign-in", async () => {
    const callbackUrl = "/listing/abcdef0123456789abcdef01#bids";
    const { container, rerender } = render(<AuthForm callbackUrl={callbackUrl} />);
    fill("a");
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ callbackUrl }));
    mocks.useSession.mockReturnValue({ status: "authenticated" });
    rerender(<AuthForm callbackUrl={callbackUrl} />);
    expect(mocks.push).toHaveBeenCalledWith(callbackUrl);
  });

  it.each([
    ["a", "Use at least 12 characters."],
    ["é".repeat(36) + "a", "Use no more than 72 bytes."],
    ["😀".repeat(18) + "a", "Use no more than 72 bytes."],
  ])("blocks registration before submitting an invalid password: %s", async (password, message) => {
    const { container } = render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create an Account" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Driver" } });
    fill(password);
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(12), "é".repeat(36), "😀".repeat(18), " long secret "])("registers with the exact valid password: %s", async (password) => {
    const { container } = render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create an Account" }));
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

describe("authentication form feedback", () => {
  it("shows every registration problem next to its field", async () => {
    const { container } = render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create an Account" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });

    for (const label of ["Full name", "Email address", "Password"]) {
      const field = screen.getByLabelText(label);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const described = (field.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.getAttribute("role"));
      expect(described).toContain("alert");
    }
    expect(document.activeElement).toBe(screen.getByLabelText("Full name"));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("tells a member whose sign-in failed what to do next", async () => {
    mocks.signIn.mockResolvedValue({ error: "CredentialsSignin" });
    const { container } = render(<AuthForm />);
    fill("a".repeat(12));
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.error).toHaveBeenCalledWith("Check your email and password, then try again.");
  });

  it("keeps spellcheck off the email field and ends placeholders with an ellipsis", () => {
    render(<AuthForm />);
    expect(screen.getByLabelText("Email address").getAttribute("spellcheck")).toBe("false");
    for (const field of [screen.getByLabelText("Email address"), screen.getByLabelText("Password")]) {
      expect(field.getAttribute("placeholder")).toMatch(/…$/);
    }
  });
});
