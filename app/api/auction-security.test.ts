import { describe, expect, it } from "vitest";

import {
  AuctionRequestError,
  auctionErrorResponse,
  isJsonObject,
  requireListingId,
  requireSafeInteger,
} from "./auction-security";

describe("auction request validation", () => {
  it.each([
    [{}, true],
    [{ listingId: "abc" }, true],
    [[], false],
    [null, false],
    ["object", false],
  ])("identifies JSON objects", (value, expected) => {
    expect(isJsonObject(value)).toBe(expected);
  });

  it("accepts a case-insensitive MongoDB ObjectId", () => {
    expect(requireListingId("ABCDEF0123456789abcdef01")).toBe(
      "ABCDEF0123456789abcdef01"
    );
  });

  it.each([undefined, null, "", "abc", "g".repeat(24), "a".repeat(23)])(
    "rejects an invalid listing id: %s",
    (value) => {
      expect(() => requireListingId(value)).toThrowError(
        expect.objectContaining({ status: 400, message: "Invalid listing ID" })
      );
    }
  );

  it.each([
    [1, 1],
    ["42", 42],
    [2_147_483_647, 2_147_483_647],
  ])("accepts safe positive integers", (value, expected) => {
    expect(requireSafeInteger(value, "Bid amount")).toBe(expected);
  });

  it("allows zero only when explicitly configured", () => {
    expect(requireSafeInteger(0, "Starting bid", { allowZero: true })).toBe(0);
    expect(() => requireSafeInteger(0, "Bid amount")).toThrow(
      "Bid amount must be an integer between 1 and 2147483647"
    );
  });

  it.each(["", "   ", 1.5, "1.5", -1, NaN, Infinity, 2_147_483_648])(
    "rejects an unsafe integer: %s",
    (value) => {
      expect(() => requireSafeInteger(value, "Amount")).toThrow(
        AuctionRequestError
      );
    }
  );

  it("turns known request errors into JSON responses", async () => {
    const response = auctionErrorResponse(
      new AuctionRequestError(409, "Auction changed")
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({ error: "Auction changed" });
  });

  it("handles malformed JSON errors and leaves unknown errors alone", async () => {
    const malformedResponse = auctionErrorResponse(new SyntaxError("bad json"));

    expect(malformedResponse?.status).toBe(400);
    await expect(malformedResponse?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(auctionErrorResponse(new Error("database unavailable"))).toBeNull();
  });
});
