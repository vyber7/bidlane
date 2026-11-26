"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, formatLocalDate, formatMonthYear, type DateStyle } from "@/app/utils/format";

const utcFormat: Record<DateStyle, (date: Date) => string> = {
  date: formatDate,
  dateTime: formatDateTime,
  monthYear: formatMonthYear,
};

const subscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

/**
 * A `<time>` that renders in UTC on the server and during hydration, so both
 * sides agree, then in the viewer's locale and time zone once mounted.
 */
export default function LocalTime({ date, format = "dateTime", className }: {
  date: Date | string;
  format?: DateStyle;
  className?: string;
}) {
  const mounted = useSyncExternalStore(subscribe, isClient, isServer);
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  const text = mounted
    ? formatLocalDate(value, format, { locales: navigator.languages })
    : utcFormat[format](value);
  return <time dateTime={value.toISOString()} className={className}>{text}</time>;
}
