// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountNotification, NotificationFeed } from "@/app/types/account";

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), refresh: vi.fn(), version: 0 }));
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { ...actual, default: { ...actual.default, get: mocks.get, patch: mocks.patch } };
});
vi.mock("@/app/context/NotificationContext", () => ({ useNotifications: () => ({ version: mocks.version, summary: { userId: "buyer", unreadCount: 1 }, refresh: mocks.refresh }) }));
import NotificationsCenter from "./NotificationsCenter";
const item: AccountNotification = { id: "abcdef0123456789abcdef01", title: "You’ve been outbid", message: "Another buyer is leading.", kind: "bid", tone: "warning", createdAt: "2026-10-14T12:00:00.000Z", readAt: null, href: "/listing/car", actionLabel: "Bid again" };
const feed: NotificationFeed = { items: [item], total: 1, unreadCount: 1, nextCursor: null };
const view = (initialFeed = feed) => <NotificationsCenter initialFeed={initialFeed} userId="buyer" />;
beforeEach(() => {
  vi.clearAllMocks(); mocks.version = 0;
  mocks.get.mockResolvedValue({ data: feed });
  mocks.patch.mockResolvedValue({ data: { updated: 1 } });
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("persistent notification inbox", () => {
  it("saves read state on the server and refreshes the shared header count", async () => {
    await act(async () => { render(view()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as read" })); });
    expect(mocks.patch).toHaveBeenCalledExactlyOnceWith("/api/notifications", { ids: [item.id] });
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("does not show a successful read if the server write fails", async () => {
    mocks.patch.mockRejectedValueOnce({ isAxiosError: true, response: { data: { error: "Unable to save read status" } } });
    await act(async () => { render(view()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as read" })); });
    expect(screen.getByRole("alert").textContent).toContain("Unable to save read status");
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeDefined();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("marks all through the displayed newest event, including unloaded older records", async () => {
    const initial = { ...feed, total: 100, unreadCount: 100 };
    mocks.get.mockResolvedValueOnce({ data: initial });
    mocks.patch.mockResolvedValueOnce({ data: { updated: 100 } });
    await act(async () => { render(view(initial)); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark all as read" })); });
    expect(mocks.patch).toHaveBeenCalledWith("/api/notifications", { all: true, before: item.createdAt });
    expect(screen.getByRole("button", { name: "Mark all as read" })).toHaveProperty("disabled", true);
  });

  it("reflects read state changed on another device when the live version updates", async () => {
    const { rerender } = render(view());
    await act(async () => {});
    mocks.get.mockResolvedValueOnce({ data: { ...feed, unreadCount: 0, items: [{ ...item, readAt: "2026-10-14T13:00:00Z" }] } });
    mocks.version += 1;
    await act(async () => { rerender(view()); });
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
  });

  it("discards a stale inbox response that arrives after a successful read", async () => {
    const { rerender } = render(view());
    await act(async () => {});
    let resolve!: (response: { data: NotificationFeed }) => void;
    mocks.get.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    mocks.version += 1;
    await act(async () => { rerender(view()); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as read" })); });
    await act(async () => { resolve({ data: feed }); });
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
  });

  it("loads older events without duplicating rows and requests unread records separately", async () => {
    const initial = { ...feed, total: 2, nextCursor: item.id };
    mocks.get.mockResolvedValueOnce({ data: initial });
    await act(async () => { render(view(initial)); });
    mocks.get.mockResolvedValueOnce({ data: { ...feed, total: 2, items: [{ ...item, id: "older", title: "You won the auction" }] } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more" })); });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(screen.getByText("You won the auction")).toBeDefined();
    expect(mocks.get).toHaveBeenLastCalledWith(`/api/notifications?view=all&cursor=${item.id}`);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Unread 1/ })); });
    expect(mocks.get).toHaveBeenLastCalledWith("/api/notifications?view=unread");
  });
});
