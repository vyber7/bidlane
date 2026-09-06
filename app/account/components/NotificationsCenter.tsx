"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  FiArrowUpRight,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiMessageSquare,
  FiTrendingUp,
} from "react-icons/fi";

export type AccountNotification = {
  id: string;
  kind: "bid" | "auction" | "comment";
  title: string;
  message: string;
  createdAt: string;
  href: string;
  actionLabel: string;
  tone: "success" | "warning" | "neutral";
};

type View = "all" | "unread";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const NotificationsCenter = ({
  notifications,
  userId,
}: {
  notifications: AccountNotification[];
  userId: string;
}) => {
  const storageKey = `auto-auctions:read-notifications:${userId}`;
  const [view, setView] = useState<View>("all");

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener("notifications-read", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener("notifications-read", onStoreChange);
    };
  }, []);
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey) ?? "[]",
    [storageKey]
  );
  const storedReadIds = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const readIds = useMemo(() => {
    try {
      const stored: unknown = JSON.parse(storedReadIds);
      return Array.isArray(stored)
        ? stored.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }, [storedReadIds]);

  const read = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = notifications.filter((item) => !read.has(item.id)).length;
  const visible =
    view === "unread"
      ? notifications.filter((item) => !read.has(item.id))
      : notifications;

  const saveReadIds = (ids: string[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
    window.dispatchEvent(new Event("notifications-read"));
  };

  const markRead = (id: string) => {
    if (!read.has(id)) saveReadIds([...readIds, id]);
  };

  const markAllRead = () => {
    saveReadIds(Array.from(new Set([...readIds, ...notifications.map((item) => item.id)])));
  };

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
            onClick={markAllRead}
            disabled={!unreadCount}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-gray-900 hover:underline disabled:cursor-default disabled:text-gray-400 disabled:no-underline"
          >
            <FiCheck /> Mark all as read
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-gray-200 bg-gray-50">
        <Summary icon={<FiBell />} label="Total" value={notifications.length} />
        <Summary icon={<FiCheckCircle />} label="Unread" value={unreadCount} />
      </div>

      <div className="border-b border-gray-200 px-4 pt-3 sm:px-6">
        <div className="flex gap-5" role="tablist" aria-label="Notification filters">
          {([
            { id: "all", label: "All", count: notifications.length },
            { id: "unread", label: "Unread", count: unreadCount },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                view === tab.id
                  ? "border-gray-950 text-gray-950"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}
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

      {visible.length ? (
        <ul className="divide-y divide-gray-200">
          {visible.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              isRead={read.has(notification.id)}
              onRead={() => markRead(notification.id)}
            />
          ))}
        </ul>
      ) : (
        <EmptyNotifications unreadOnly={view === "unread"} />
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
      <span className="text-base">{icon}</span>
      {label}
    </div>
    <p className="mt-1 text-2xl font-bold text-gray-950">{value}</p>
  </div>
);

const NotificationRow = ({
  notification,
  isRead,
  onRead,
}: {
  notification: AccountNotification;
  isRead: boolean;
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
              <p className="mt-1 text-sm leading-6 text-gray-600">{notification.message}</p>
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
