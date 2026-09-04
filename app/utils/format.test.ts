import { describe, expect, it } from "vitest";

import {
  canEndAuction,
  capitalize,
  formatAmount,
  formatTimeLeft,
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
    [0, "ENDING..."],
    [-1, "ENDING..."],
    [5, "5s"],
    [65, "1m 5s"],
    [3_661, "1h 1m 1s"],
  ])("formats a countdown of %i seconds", (seconds, expected) => {
    expect(formatTimeLeft(seconds)).toBe(expected);
  });

  it.each([
    ["ENDING...", true],
    ["2h 59m 59s", true],
    ["3h 0m 0s", false],
    ["15m 0s", true],
    ["10s", true],
    ["1d 0h 0m 0s", false],
  ])("decides whether %s may be ended", (timeLeft, expected) => {
    expect(canEndAuction(timeLeft)).toBe(expected);
  });
});
