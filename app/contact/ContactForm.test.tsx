// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, post: mocks.post } };
});
import ContactForm from "./ContactForm";
function fill() {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } });
  fireEvent.change(screen.getByLabelText("What can we help with?"), { target: { value: "General question" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello team" } });
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
describe("contact form", () => {
  it("waits for acceptance before confirming and clearing the fields; prevents duplicate submissions", async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { container } = render(<ContactForm />); fill();
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending…" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Message")).toHaveProperty("value", "Hello team");
    expect(mocks.post).toHaveBeenCalledWith("/api/contact", expect.objectContaining({
      name: "Alex", email: "alex@example.com", topic: "General question", message: "Hello team", website: "", submissionId: expect.any(String),
    }));
    await act(async () => { resolve({ data: { success: true } }); });
    expect(screen.getByRole("status").textContent).toContain("Message sent");
    expect(screen.getByLabelText("Message")).toHaveProperty("value", "");
  });
  it("preserves all fields after a failed request and retries with the same submission ID", async () => {
    mocks.post.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Please wait before trying again." } } });
    const { container } = render(<ContactForm />); fill();
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(screen.getByRole("alert").textContent).toContain("Please wait");
    expect(screen.getByLabelText("Message")).toHaveProperty("value", "Hello team");
    expect(screen.getByLabelText("Your name")).toHaveProperty("value", "Alex");
    expect(screen.queryByRole("status")).toBeNull();
    mocks.post.mockResolvedValueOnce({ data: { success: true } });
    await act(async () => { fireEvent.submit(container.querySelector("form")!); });
    expect(mocks.post.mock.calls[0][1]).toEqual(mocks.post.mock.calls[1][1]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
  });
});
