"use client";

import Link from "next/link";
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
  FiMessageSquare,
  FiTrendingUp,
} from "react-icons/fi";
import type { AccountNotification, NotificationFeed } from "@/app/types/account";

type View = "all" | "unread";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const NotificationsCenter = ({ initialFeed, userId }: { initialFeed: NotificationFeed; userId: string }) => {
  const { version, refresh, summary } = useNotifications();
  const accountId = summary?.userId;
  const [view, setView] = useState<View>("all");
  const [feed, setFeed] = useState(initialFeed);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestNumber = useRef(0);
  const readInFlight = useRef(false);
  const unreadCount = feed.unreadCount;
  const visible = view === "unread" ? feed.items.filter((item) => !item.readAt) : feed.items;

  const loadFirst = useCallback(async () => {
    const request = ++requestNumber.current;
    setIsLoading(true);
    try {
      const response = await axios.get<NotificationFeed>(`/api/notifications?view=${view}`);
      if (request !== requestNumber.current) return;
      setFeed(response.data);
      setError(null);
    } catch (error) {
      if (request === requestNumber.current) setError(getApiErrorMessage(error, "Unable to refresh notifications."));
    } finally {
      if (request === requestNumber.current) setIsLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (accountId && accountId !== userId) return;
    void loadFirst();
    return () => { requestNumber.current += 1; };
  }, [loadFirst, version, accountId, userId]);

  async function loadMore() {
    if (!feed.nextCursor || isLoading) return;
    const request = ++requestNumber.current;
    setIsLoading(true);
    try {
      const response = await axios.get<NotificationFeed>(`/api/notifications?view=${view}&cursor=${feed.nextCursor}`);
      if (request !== requestNumber.current) return;
      setFeed((previous) => ({ ...response.data, items: [...new Map([...previous.items, ...response.data.items].map((item) => [item.id, item])).values()] }));
      setError(null);
    } catch (error) {
      if (request === requestNumber.current) setError(getApiErrorMessage(error, "Unable to load more notifications."));
    } finally {
      if (request === requestNumber.current) setIsLoading(false);
    }
  }

  async function markRead(id?: string) {
    const before = feed.items[0]?.createdAt;
    if (readInFlight.current || (!id && !before)) return;
    readInFlight.current = true;
    setIsSaving(true);
    setError(null);
    // Invalidate any older GET so it cannot restore an unread row after PATCH.
    requestNumber.current += 1;
    setIsLoading(false);
    try {
      const response = await axios.patch<{ updated: number }>("/api/notifications", id ? { ids: [id] } : { all: true, before });
      requestNumber.current += 1;
      setIsLoading(false);
      const readAt = new Date().toISOString();
      setFeed((previous) => ({ ...previous,
        unreadCount: Math.max(0, previous.unreadCount - response.data.updated),
        items: previous.items.map((item) => (!item.readAt && (id ? item.id === id : item.createdAt <= before!)) ? { ...item, readAt } : item),
      }));
      await refresh();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to mark notifications as read."));
    } finally {
      readInFlight.current = false;
      setIsSaving(false);
    }
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
            onClick={() => void markRead()}
            disabled={!unreadCount || isSaving || !feed.items.length}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-gray-900 hover:underline disabled:cursor-default disabled:text-gray-400 disabled:no-underline"
          >
            <FiCheck /> Mark all as read
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50">
        <Summary icon={<FiBell />} label="Total" value={feed.total} />
        <Summary icon={<FiCheckCircle />} label="Unread" value={unreadCount} />
      </div>

      <div className="border-b border-gray-200 px-4 pt-3 sm:px-6">
        <div className="flex gap-5" role="group" aria-label="Notification filters">
          {([
            { id: "all", label: "All", count: feed.total },
            { id: "unread", label: "Unread", count: unreadCount },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                view === tab.id
                  ? "border-gray-950 text-gray-950"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}{" "}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  view === tab.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-800"><p>{error}</p><button type="button" onClick={() => void loadFirst()} disabled={isLoading} className="font-bold underline">Retry</button></div>}
      {visible.length ? (
        <ul className="divide-y divide-gray-200">
          {visible.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              isRead={notification.readAt !== null}
              isSaving={isSaving}
              onRead={() => { if (!notification.readAt) void markRead(notification.id); }}
            />
          ))}
        </ul>
      ) : (
        <EmptyNotifications unreadOnly={view === "unread"} />
      )}
      {feed.nextCursor && <div className="border-t border-gray-200 p-4 text-center"><button type="button" onClick={() => void loadMore()} disabled={isLoading || isSaving} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50">{isLoading ? "Loading…" : "Load more"}</button></div>}
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
      <span className="text-base">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
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
  onRead: () => void;
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
    <li className={`relative p-4 transition-colors sm:p-5 ${isRead ? "bg-white" : "bg-blue-50/40"}`}>
      {!isRead && (
        <span className="absolute left-0 top-0 h-full w-1 bg-blue-600" aria-label="Unread" />
      )}
      <div className="flex gap-3 sm:gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${iconTone}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h3 className="font-bold text-gray-950">{notification.title}</h3>
              <p className="mt-1 break-words text-sm leading-6 text-gray-600">{notification.message}</p>
            </div>
            <time
              dateTime={notification.createdAt}
              className="shrink-0 text-xs text-gray-500"
            >
              {dateTime.format(new Date(notification.createdAt))}
            </time>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <Link
              href={notification.href}
              onClick={onRead}
              className="inline-flex items-center gap-1 text-sm font-bold text-gray-900 hover:underline"
            >
              {notification.actionLabel} <FiArrowUpRight />
            </Link>
            {!isRead && (
              <button
                type="button"
                onClick={onRead}
                disabled={isSaving}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 hover:underline"
              >
                Mark as read
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
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-700">
      {unreadOnly ? <FiCheckCircle /> : <FiBell />}
    </div>
    <h3 className="text-lg font-bold text-gray-950">
      {unreadOnly ? "You’re all caught up" : "No notifications yet"}
    </h3>
    <p className="mt-1 max-w-sm text-sm text-gray-500">
      {unreadOnly
        ? "You’ve read every notification in your inbox."
        : "Bid updates, auction results, and comments on your listings will appear here."}
    </p>
    {!unreadOnly && (
      <Link
        href="/live/listings"
        className="mt-5 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gray-700"
      >
        Browse live auctions
      </Link>
    )}
  </div>
);

export default NotificationsCenter;
