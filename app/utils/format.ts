const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 });
const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatAmount(amount: number) {
  return numberFormatter.format(amount);
}

export function formatPrice(amount: number) {
  return priceFormatter.format(amount);
}

export function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${formatAmount(count)} ${count === 1 ? singular : plural}`;
}

//capitalize first letter of string
export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatDisplayName(name: string | null | undefined, fallback = "User") {
  const trimmed = name?.trim();
  return trimmed ? capitalize(trimmed) : fallback;
}

// Dates first render in UTC with a fixed locale so the server and browser
// agree; LocalTime then reformats them in the viewer's locale and time zone.
export type DateStyle = "date" | "dateTime" | "monthYear";
type DateInput = Date | string;

const dateStyles: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  dateTime: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" },
  monthYear: { year: "numeric", month: "long" },
};

const utcFormatters = Object.fromEntries(
  Object.entries(dateStyles).map(([style, options]) => [style, new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" })]),
) as Record<DateStyle, Intl.DateTimeFormat>;

export function formatDate(date: DateInput) {
  return utcFormatters.date.format(new Date(date));
}

export function formatDateTime(date: DateInput) {
  return utcFormatters.dateTime.format(new Date(date));
}

export function formatMonthYear(date: DateInput) {
  return utcFormatters.monthYear.format(new Date(date));
}

const localFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Formats a date in the given locales and time zone, defaulting to the
 * runtime's own. Only call it after hydration; on the server use the UTC
 * formatters above.
 */
export function formatLocalDate(
  date: DateInput,
  style: DateStyle,
  { locales, timeZone }: { locales?: readonly string[]; timeZone?: string } = {},
) {
  const key = `${locales?.join(",") ?? ""}|${style}|${timeZone ?? ""}`;
  let formatter = localFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locales?.length ? [...locales] : undefined, { ...dateStyles[style], timeZone });
    localFormatters.set(key, formatter);
  }
  return formatter.format(new Date(date));
}

export function formatAuctionCountdown(remainingMs: number) {
  if (remainingMs <= 0) return "Ending…";

  const secondsTotal = Math.floor(remainingMs / 1000);
  const weeks = Math.floor(secondsTotal / (7 * 24 * 3600));
  const days = Math.floor(secondsTotal / (24 * 3600));
  const hours = Math.floor((secondsTotal % (24 * 3600)) / 3600);
  const minutes = Math.floor((secondsTotal % 3600) / 60);
  const seconds = secondsTotal % 60;

  if (weeks > 0) return `${weeks}w ${days % 7}d ${hours}h ${minutes}m ${seconds}s`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h : ${minutes}m : ${seconds}s`;
  if (minutes > 0) return `${minutes}m : ${seconds}s`;
  return `${seconds}s`;
}
