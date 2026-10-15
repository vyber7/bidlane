"use client";

import Link from "next/link";
import { FiBell } from "react-icons/fi";
import { useNotifications } from "@/app/context/NotificationContext";

export default function NotificationBell() {
  const { summary } = useNotifications();
  const count = summary?.unreadCount ?? 0;
  return <Link href="/account/notifications" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
    className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">
    <FiBell aria-hidden="true" />
    {count > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-400 px-1 text-center text-[10px] font-bold leading-5 text-slate-950">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
