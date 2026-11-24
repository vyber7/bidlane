import { describe, expect, it } from "vitest";

import {
  capitalize,
  formatAmount,
  formatAuctionCountdown,
  formatBid,
  formatCount,
  formatDate,
  formatDateTime,
  formatMonthYear,
} from "./format";

describe("display formatting", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1,000"],
    [1_234_567, "1,234,567"],
  ])("formats %i as %s", (amount, expected) => {
    expect(formatAmount(amount)).toBe(expected);
  });

  it("formats whole-dollar bids separately from plain numbers", () => {
    expect(formatBid(12500)).toBe("$12,500");
    expect(formatBid(0)).toBe("$0");
  });

  it("formats calendar dates the same in every time zone", () => {
    expect(formatDate(new Date("2026-11-24T23:30:00Z"))).toBe("Nov 24, 2026");
    expect(formatDate("2026-01-05T00:15:00Z")).toBe("Jan 5, 2026");
  });

  it("formats date-times in UTC and says so", () => {
    expect(formatDateTime(new Date("2026-11-24T23:30:00Z"))).toBe("Nov 24, 2026, 11:30 PM UTC");
    expect(formatDateTime("2026-01-05T09:05:00Z")).toBe("Jan 5, 2026, 9:05 AM UTC");
  });

  it("formats a membership month in UTC", () => {
    expect(formatMonthYear("2026-11-30T23:59:00Z")).toBe("November 2026");
    expect(formatMonthYear(new Date("2026-01-01T00:00:00Z"))).toBe("January 2026");
  });

  it.each([
    [0, "bid", undefined, "0 bids"],
    [1, "bid", undefined, "1 bid"],
    [2, "comment", undefined, "2 comments"],
    [1_250, "photo", undefined, "1,250 photos"],
    [1, "vehicle sold", "vehicles sold", "1 vehicle sold"],
    [3, "vehicle sold", "vehicles sold", "3 vehicles sold"],
  ])("counts %i %s", (count, singular, plural, expected) => {
    expect(formatCount(count, singular, plural)).toBe(expected);
  });

  it.each([
    [0, "Ending…"],
    [-1_000, "Ending…"],
    [5_000, "5s"],
  ])("shows %i ms remaining as %s", (remainingMs, expected) => {
    expect(formatAuctionCountdown(remainingMs)).toBe(expected);
  });

  it("capitalizes the first character", () => {
    expect(capitalize("auction")).toBe("Auction");
    expect(capitalize("")).toBe("");
  });
});
