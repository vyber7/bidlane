import { describe, expect, it } from "vitest";

import {
  canEndAuction,
  capitalize,
  formatAmount,
  formatTimeLeft,
  formatTimeLeftShort,
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

  it("capitalizes the first character", () => {
    expect(capitalize("auction")).toBe("Auction");
    expect(capitalize("")).toBe("");
  });

  it.each([
    [0, "Ending..."],
    [-1, "Ending..."],
    [5, "5s"],
    [65, "1m 5s"],
    [3_661, "1h 1m 1s"],
  ])("formats a countdown of %i seconds", (seconds, expected) => {
    expect(formatTimeLeft(seconds)).toBe(expected);
  });

  it("allows finalization for the expired countdown formats", () => {
    expect(canEndAuction(formatTimeLeft(0))).toBe(true);
    expect(canEndAuction(formatTimeLeftShort(0))).toBe(true);
    expect(canEndAuction("")).toBe(false);
  });

  it.each([
    ["Ending...", true],
    ["2h 59m 59s", false],
    ["3h 0m 0s", false],
    ["15m 0s", false],
    ["10s", false],
    ["1d 0h 0m 0s", false],
  ])("decides whether %s may be ended", (timeLeft, expected) => {
    expect(canEndAuction(timeLeft)).toBe(expected);
  });
});
