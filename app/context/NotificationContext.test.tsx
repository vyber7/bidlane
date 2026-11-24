// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ email: "buyer@example.test" as string | null, fetch: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: mocks.email ? { user: { email: mocks.email } } : null }) }));
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { NotificationProvider } from "./NotificationContext";
import NotificationBell from "@/app/components/NotificationBell";

const response = (unreadCount: number, userId = "buyer") => new Response(JSON.stringify({ userId, unreadCount }));
let realtime: FakeRealtime;
beforeEach(() => {
  vi.clearAllMocks();
  realtime = installFakeRealtime();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.email = "buyer@example.test";
  mocks.fetch.mockResolvedValue(response(2));
});
afterEach(() => { cleanup(); realtime.uninstall(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const view = () => <NotificationProvider><NotificationBell /></NotificationProvider>;

describe("live notification count", () => {
  it("fetches the account count and refreshes after a private event or reconnect", async () => {
    await act(async () => { render(view()); });
    expect(screen.getByRole("link", { name: "Notifications, 2 unread" })).toBeDefined();
    expect(realtime.subscribed("user:buyer")).toBe(true);
    mocks.fetch.mockResolvedValue(response(3));
    await act(async () => { realtime.deliver("user:buyer", "notifications-changed", {}); });
    expect(screen.getByRole("link", { name: "Notifications, 3 unread" })).toBeDefined();
    mocks.fetch.mockResolvedValue(response(0));
    await act(async () => { realtime.ready("user:buyer"); });
    expect(screen.getByRole("link", { name: "Notifications" })).toBeDefined();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("recovers missed delivery by polling and focusing the window", async () => {
    await act(async () => { render(view()); });
    mocks.fetch.mockImplementation(() => Promise.resolve(response(4)));
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(screen.getByRole("link", { name: "Notifications, 4 unread" })).toBeDefined();
    mocks.fetch.mockImplementation(() => Promise.resolve(response(5)));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByRole("link", { name: "Notifications, 5 unread" })).toBeDefined();
  });

  it("retains the last known count during failures and retries", async () => {
    await act(async () => { render(view()); });
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByRole("link", { name: "Notifications, 2 unread" })).toBeDefined();
    mocks.fetch.mockResolvedValueOnce(response(6));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByRole("link", { name: "Notifications, 6 unread" })).toBeDefined();
  });

  it("clears the previous account and unsubscribes on sign-out", async () => {
    const { rerender } = render(view());
    await act(async () => {});
    mocks.email = null;
    await act(async () => { rerender(view()); });
    expect(screen.getByRole("link", { name: "Notifications" })).toBeDefined();
    expect(realtime.subscribed("user:buyer")).toBe(false);
    expect(realtime.listeners("user:buyer")).toBe(0);
  });

  it("ignores a late response from an earlier request or account", async () => {
    let resolve!: (response: Response) => void;
    mocks.fetch.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
    const { rerender } = render(view());
    mocks.email = "other@example.test";
    mocks.fetch.mockResolvedValueOnce(response(1, "other"));
    await act(async () => { rerender(view()); });
    await act(async () => { resolve(response(99)); });
    expect(screen.getByRole("link", { name: "Notifications, 1 unread" })).toBeDefined();
    expect(realtime.everSubscribed("user:buyer")).toBe(false);
  });
});
