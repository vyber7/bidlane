const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 });
const bidFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatAmount(amount: number) {
  return numberFormatter.format(amount);
}

export function formatBid(amount: number) {
  return bidFormatter.format(amount);
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

// Dates render in UTC with a fixed locale so the server and browser agree.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type DateInput = Date | string;

export function formatDate(date: DateInput) {
  return dateFormatter.format(new Date(date));
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatDateTime(date: DateInput) {
  return dateTimeFormatter.format(new Date(date));
}

const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatMonthYear(date: DateInput) {
  return monthYearFormatter.format(new Date(date));
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
