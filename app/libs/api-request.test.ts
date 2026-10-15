import { describe, expect, it } from "vitest";

import {
  ApiRequestError,
  apiErrorResponse,
  isJsonObject,
  readJsonObject,
  errorResponse,
  requireListingId,
  requireSafeInteger,
} from "./api-request";

describe("API request validation", () => {
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
        ApiRequestError
      );
    }
  );

  it("turns known request errors into JSON responses", async () => {
    const response = apiErrorResponse(
      new ApiRequestError(409, "Auction changed")
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({ error: "Auction changed" });
  });

  it("leaves unexpected errors, including internal syntax errors, for the route's 500 handler", () => {
    expect(apiErrorResponse(new SyntaxError("internal parsing failed"))).toBeNull();
    expect(apiErrorResponse(new Error("database unavailable"))).toBeNull();
  });

  it("reads an object and rejects malformed JSON at the parsing boundary", async () => {
    const request = (body: string) => new Request("http://localhost/api", { method: "POST", body });
    await expect(readJsonObject(request('{"watching":false}'))).resolves.toEqual({ watching: false });
    await expect(readJsonObject(request("{"))).rejects.toMatchObject({ status: 400, message: "Invalid JSON body" });
    await expect(readJsonObject(request("[]"))).rejects.toMatchObject({ status: 400, message: "Invalid request body" });
  });

  it.each([400, 401, 403, 404, 409, 500])("uses the same JSON error envelope for status %i", async (status) => {
    const response = errorResponse("Request failed", status);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Request failed" });
  });
});
