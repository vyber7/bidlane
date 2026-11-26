"use client";

import LocalTime from "@/app/components/LocalTime";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNotifications } from "@/app/context/NotificationContext";
import { getApiErrorMessage } from "@/app/utils/api-error";
import {
  FiArrowUpRight,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiLoader,
  FiMessageSquare,
  FiTrendingUp,
} from "react-icons/fi";
import type { AccountNotification, NotificationFeed } from "@/app/types/account";
import { formatAmount, formatCount } from "@/app/utils/format";
import { updateAccountUrl } from "./AccountTabs";

type View = "all" | "unread";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

const NotificationsCenter = ({ initialFeed, initialView, userId }: {
  initialFeed: NotificationFeed;
  initialView: View;
  userId: string;
}) => {
  const { version, refresh, summary } = useNotifications();
  const accountId = summary?.userId;
  const view: View = useSearchParams().get("view") === "unread" ? "unread" : "all";
  const [{ view: loadedView, feed }, setFeed] = useState({ view: initialView, feed: initialFeed });
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestNumber = useRef(0);
  const readInFlight = useRef(false);
  const filters = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const hasCurrentFeed = view === loadedView;
  const unreadCount = feed.unreadCount;
  const visible = view === "unread" ? feed.items.filter((item) => !item.readAt) : feed.items;

  const focusFilter = useCallback(() => {
    filters.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
  }, []);

  const loadFirst = useCallback(async (targetView: View) => {
    const request = ++requestNumber.current;
    setIsLoading(true);
    try {
      const response = await axios.get<NotificationFeed>(`/api/notifications?view=${targetView}`);
      if (request !== requestNumber.current || readInFlight.current) return;
      const focused = document.activeElement;
      if (focused && list.current?.contains(focused)) {
        const id = focused.closest<HTMLElement>("li[data-notification-id]")?.dataset.notificationId;
        const item = response.data.items.find((notification) => notification.id === id);
        if (!item || (targetView === "unread" && item.readAt)) focusFilter();
        else if (item.readAt && focused.matches("[data-mark-read]")) {
          focused.closest("li")?.querySelector<HTMLAnchorElement>("a")?.focus();
        }
      }
      setFeed({ view: targetView, feed: response.data });
      setError(null);
    } catch (error) {
      if (request === requestNumber.current) setError(getApiErrorMessage(error, "Unable to refresh notifications."));
    } finally {
      if (request === requestNumber.current) setIsLoading(false);
    }
  }, [focusFilter]);

  useEffect(() => {
    if (accountId && accountId !== userId) return;
    // Server-driven refreshes must block concurrent pagination while loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFirst(view);
    return () => { requestNumber.current += 1; };
  }, [loadFirst, version, accountId, userId, view]);

  async function loadMore() {
    if (!hasCurrentFeed || !feed.nextCursor || isLoading || readInFlight.current) return;
    const request = ++requestNumber.current;
    setIsLoading(true);
    try {
      const response = await axios.get<NotificationFeed>(`/api/notifications?view=${view}&cursor=${feed.nextCursor}`);
      if (request !== requestNumber.current) return;
      setFeed((previous) => ({
        view,
        feed: { ...response.data, items: [...new Map([...previous.feed.items, ...response.data.items].map((item) => [item.id, item])).values()] },
      }));
      setError(null);
    } catch (error) {
      if (request === requestNumber.current) setError(getApiErrorMessage(error, "Unable to load more notifications."));
    } finally {
      if (request === requestNumber.current) setIsLoading(false);
    }
  }

  async function markRead(id?: string, trigger?: HTMLButtonElement) {
    const before = feed.items[0]?.createdAt;
    if (readInFlight.current || !hasCurrentFeed || (!id && (!before || !unreadCount))) return;
    readInFlight.current = true;
    setIsSaving(true);
    setError(null);
    setAnnouncement("");
    // Invalidate any older GET so it cannot restore an unread row after PATCH.
    requestNumber.current += 1;
    setIsLoading(false);
    let saved = false;
    try {
      const response = await axios.patch<{ updated: number }>("/api/notifications", id ? { ids: [id] } : { all: true, before });
      requestNumber.current += 1;
      setIsLoading(false);
      const updated = response.data.updated;
      if (trigger && document.activeElement === trigger) {
        const row = trigger.closest("li");
        if (id && row) {
          const neighbor = row.nextElementSibling ?? row.previousElementSibling;
          const target = (view === "unread" ? neighbor : row)?.querySelector<HTMLAnchorElement>("a");
          if (target) target.focus();
          else focusFilter();
        } else if (unreadCount <= updated) {
          focusFilter();
        }
      }
      const readAt = new Date().toISOString();
      setFeed((previous) => ({
        ...previous,
        feed: {
          ...previous.feed,
          unreadCount: Math.max(0, previous.feed.unreadCount - updated),
          items: previous.feed.items.map((item) => (!item.readAt && (id ? item.id === id : item.createdAt <= before!)) ? { ...item, readAt } : item),
        },
      }));
      setAnnouncement(id ? "Notification marked as read." : `${formatCount(updated, "notification")} marked as read.`);
      saved = true;
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to mark notifications as read."));
    } finally {
      readInFlight.current = false;
      setIsSaving(false);
    }
    const currentView = new URLSearchParams(window.location.search).get("view") === "unread" ? "unread" : "all";
    if (filters.current && currentView !== view) void loadFirst(currentView);
    if (saved) await refresh();
  }

  return (
    <section className="overflow-hidden rounded-md bg-white shadow-md shadow-gray-400">
      <div className="border-b border-gray-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
              Account activity
            </p>
            <h2 className="text-2xl font-bold text-gray-950">Notifications</h2>
            <p className="mt-1 text-sm text-gray-500">
              Auction results, bid updates, and buyer questions in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={(event) => void markRead(undefined, event.currentTarget)}
            disabled={!hasCurrentFeed || !unreadCount || !feed.items.length}
            aria-disabled={isSaving || undefined}
            className={`${focusRing} inline-flex w-fit items-center gap-1.5 text-sm font-bold text-gray-900 hover:underline disabled:cursor-default disabled:text-gray-400 disabled:no-underline aria-disabled:opacity-50`}
          >
            <FiCheck aria-hidden="true" /> Mark All as Read
          </button>
        </div>
      </div>
      <p role="status" className="sr-only">{announcement}</p>

      <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50">
        <Summary icon={<FiBell />} label="Total" value={feed.total} />
        <Summary icon={<FiCheckCircle />} label="Unread" value={unreadCount} />
      </div>

      <div className="border-b border-gray-200 px-4 pt-3 sm:px-6">
        <div ref={filters} className="flex gap-5" role="group" aria-label="Notification filters">
          {([
            { id: "all", label: "All", count: feed.total },
            { id: "unread", label: "Unread", count: unreadCount },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={view === tab.id}
              onClick={() => {
                if (tab.id !== view) updateAccountUrl({ view: tab.id === "unread" ? "unread" : "" });
              }}
              className={`${focusRing} border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                view === tab.id
                  ? "border-gray-950 text-gray-950"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}{" "}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  view === tab.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {formatAmount(tab.count)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => void loadFirst(view)} disabled={isLoading} className={`${focusRing} font-bold underline hover:text-rose-950`}>
            Refresh Notifications
          </button>
        </div>
      )}
      {!hasCurrentFeed ? (
        !error && <p role="status" className="px-5 py-6 text-sm text-gray-600">Loading Notifications…</p>
      ) : visible.length ? (
        <ul ref={list} className="divide-y divide-gray-200">
          {visible.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              isRead={notification.readAt !== null}
              isSaving={isSaving}
              onRead={(trigger) => { if (!notification.readAt) void markRead(notification.id, trigger); }}
            />
          ))}
        </ul>
      ) : (
        <EmptyNotifications unreadOnly={view === "unread"} />
      )}
      {hasCurrentFeed && feed.nextCursor && (
        <div className="border-t border-gray-200 p-4 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            aria-disabled={isLoading || isSaving}
            className={`${focusRing} inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100 aria-disabled:opacity-50`}
          >
            {isLoading ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Loading…</> : "Load More"}
          </button>
        </div>
      )}
    </section>
  );
};

const Summary = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) => (
  <div className="border-r border-gray-200 px-5 py-4 last:border-r-0 sm:px-6">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span aria-hidden="true" className="text-base">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-950">{formatAmount(value)}</p>
  </div>
);

const NotificationRow = ({
  notification,
  isRead,
  isSaving,
  onRead,
}: {
  notification: AccountNotification;
  isRead: boolean;
  isSaving: boolean;
  onRead: (trigger?: HTMLButtonElement) => void;
}) => {
  const icon =
    notification.kind === "comment" ? (
      <FiMessageSquare />
    ) : notification.kind === "bid" ? (
      <FiTrendingUp />
    ) : (
      <FiClock />
    );
  const iconTone = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    neutral: "bg-gray-100 text-gray-700",
  }[notification.tone];

  return (
    <li data-notification-id={notification.id} className={`relative p-4 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_9rem] sm:p-5 ${isRead ? "bg-white" : "bg-blue-50/40"}`}>
      {!isRead && (
        <span className="absolute left-0 top-0 h-full w-1 bg-blue-600" aria-hidden="true" />
      )}
      <div className="flex gap-3 sm:gap-4">
        <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${iconTone}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h3 className="break-words font-bold text-gray-950">
                {!isRead && <><span className="sr-only">Unread:</span>{" "}</>}{notification.title}
              </h3>
              <p className="mt-1 break-words text-sm leading-6 text-gray-600">{notification.message}</p>
            </div>
            <LocalTime date={notification.createdAt} className="shrink-0 text-xs text-gray-500" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link
              href={notification.href}
              onNavigate={() => onRead()}
              className={`${focusRing} inline-flex items-center gap-1 text-sm font-bold capitalize text-gray-900 hover:underline`}
            >
              {notification.actionLabel} <FiArrowUpRight aria-hidden="true" />
            </Link>
            {!isRead && (
              <button
                type="button"
                data-mark-read
                onClick={(event) => onRead(event.currentTarget)}
                aria-disabled={isSaving}
                className={`${focusRing} text-xs font-semibold text-gray-500 hover:text-gray-900 hover:underline aria-disabled:opacity-50`}
              >
                Mark as Read
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

const EmptyNotifications = ({ unreadOnly }: { unreadOnly: boolean }) => (
  <div className="flex flex-col items-center px-6 py-16 text-center">
    <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700">
      {unreadOnly ? <FiCheckCircle /> : <FiBell />}
    </div>
    <h3 className="text-lg font-bold text-gray-950">
      {unreadOnly ? "You’re All Caught Up" : "No Notifications Yet"}
    </h3>
    <p className="mt-1 max-w-sm text-sm text-gray-500">
      {unreadOnly
        ? "You’ve read every notification in your inbox."
        : "Bid updates, auction results, and comments on your listings will appear here."}
    </p>
    {!unreadOnly && (
      <Link
        href="/?status=live#auctions"
        className={`${focusRing} mt-5 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-700`}
      >
        Browse Live Auctions
      </Link>
    )}
  </div>
);

export default NotificationsCenter;
