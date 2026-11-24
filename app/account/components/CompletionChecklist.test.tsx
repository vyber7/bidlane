// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transactionCompletion, type TransactionCompletion } from "@/app/libs/transaction-completion";
import CompletionChecklist from "./CompletionChecklist";

const fetchMock = vi.fn();
const blank = () => transactionCompletion({});
const confirmedAt = "2026-11-14T12:00:00.000Z";
const respond = (completion: TransactionCompletion) => Response.json({ role: "buyer", completion });
const mount = (completion = blank(), role: "buyer" | "seller" = "buyer") => render(<CompletionChecklist listingId="listing" role={role} initialCompletion={completion} />);

beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fetchMock.mockResolvedValue(respond(blank())); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared completion checklist", () => {
  it("shows when each party confirmed a step in the shared date-time format", async () => {
    const completion = blank();
    completion.payment.buyer = confirmedAt;
    completion.payment.seller = "2026-11-24T23:30:00.000Z";
    fetchMock.mockResolvedValue(respond(completion));
    mount(completion);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Nov 14, 2026, 12:00 PM UTC").getAttribute("dateTime")).toBe(confirmedAt);
    expect(screen.getByText("Nov 24, 2026, 11:30 PM UTC")).toBeDefined();
  });

  it("names each checkbox with its visible label", async () => {
    const { container } = mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    for (const checkbox of screen.getAllByRole("checkbox")) {
      const label = container.querySelector(`label[for="${checkbox.id}"]`) ?? checkbox.closest("label")!;
      const visible = Array.from(label.childNodes)
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains("sr-only")))
        .map((node) => node.textContent).join("").trim();
      expect(visible).not.toBe("");
      expect(checkbox.hasAttribute("aria-label")).toBe(false);
      expect(label.textContent).toContain(visible);
    }
    expect(screen.getByRole("checkbox", { name: "Confirm payment as buyer" })).toBeDefined();
  });

  it("saves a buyer's confirmation and only completes a step once both parties confirm", async () => {
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const completion = blank();
    completion.payment.buyer = confirmedAt;
    fetchMock.mockResolvedValueOnce(respond(completion));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm payment as buyer" }));
    await screen.findByText("Your confirmation was saved and shared.");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/listing/listing/completion", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ step: "payment", completed: true }) }));
    expect((screen.getByRole("checkbox", { name: "Confirm payment as buyer" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("0 of 3 steps complete")).toBeDefined();
    completion.payment.seller = confirmedAt;
    fetchMock.mockResolvedValueOnce(respond(completion));
    fireEvent.focus(window);
    await screen.findByText("1 of 3 steps complete");
    expect(screen.getByText("Seller confirmed")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Your seller confirmed payment.");
  });

  it("refreshes on entry and stops polling when the checklist leaves the viewport", async () => {
    let notify!: (isIntersecting: boolean) => void;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        notify = (isIntersecting) => callback([{ isIntersecting }]);
      }
      observe = vi.fn();
      disconnect = disconnect;
    });

    const { unmount } = mount();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { notify(true); });
    expect(fetchMock).toHaveBeenCalledOnce();

    act(() => { notify(false); });
    fireEvent.focus(window);
    expect(fetchMock).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("lets a seller reopen their own confirmation and reopens the transaction", async () => {
    const completion = blank();
    for (const step of Object.values(completion)) step.buyer = step.seller = confirmedAt;
    fetchMock.mockResolvedValueOnce(respond(completion));
    mount(completion, "seller");
    await screen.findByText("Transaction complete");
    const reopened = structuredClone(completion);
    reopened.pickup.seller = null;
    fetchMock.mockResolvedValueOnce(respond(reopened));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm pickup as seller" }));
    await screen.findByText("Your confirmation was removed.");
    expect(screen.getByText("2 of 3 steps complete")).toBeDefined();
    expect(fetchMock).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ step: "pickup", completed: false }) }));
  });

  it("keeps the saved state and permits retry when saving fails", async () => {
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Please try again." }, { status: 500 }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm paperwork as buyer" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Please try again.");
    const checkbox = screen.getByRole("checkbox", { name: "Confirm paperwork as buyer" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
  });

  it("does not let an older refresh overwrite a newly saved confirmation", async () => {
    let resolveRead!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveRead = resolve; }));
    mount();
    const completion = blank();
    completion.payment.buyer = confirmedAt;
    fetchMock.mockResolvedValueOnce(respond(completion));
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirm payment as buyer" }));
    await screen.findByText("Your confirmation was saved and shared.");
    await act(async () => { resolveRead(respond(blank())); });
    expect((screen.getByRole("checkbox", { name: "Confirm payment as buyer" }) as HTMLInputElement).checked).toBe(true);
  });
});
