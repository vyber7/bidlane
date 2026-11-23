import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartOutcome } from "@/app/libs/auction-commands";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), startAuction: vi.fn() }));

vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.getCurrentUser }));
vi.mock("@/app/libs/auction-commands", () => ({ startAuction: mocks.startAuction }));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");
const endTime = "2026-09-05T12:00:00.000Z";

function request(body: unknown) {
  return new Request("http://localhost/api/auction-start", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auction-start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "seller", email: "seller@test.dev" });
    mocks.startAuction.mockResolvedValue({ ok: true, auctionStartsAt: now, auctionEndsAt: new Date(endTime) } satisfies StartOutcome);
  });

  it("requires an authenticated user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401);
    expect(mocks.startAuction).not.toHaveBeenCalled();
  });

  it("validates the request before starting the auction", async () => {
    const response = await POST(request({ listingId: "bad", startingBid: 100, bidIncrement: 10, endTime }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid listing ID" });
    expect(mocks.startAuction).not.toHaveBeenCalled();
  });

  it("rejects a closing time with no time zone before starting the auction", async () => {
    const response = await POST(request({ listingId, startingBid: 0, bidIncrement: 10, endTime: "2026-09-05T12:00" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Choose an end time with a time zone." });
    expect(mocks.startAuction).not.toHaveBeenCalled();
  });

  it("starts the parsed auction for the signed-in seller", async () => {
    const response = await POST(request({ listingId, startingBid: "0", bidIncrement: "25", endTime }));
    expect(response.status).toBe(201);
    expect(mocks.startAuction).toHaveBeenCalledWith({
      sellerId: "seller", listingId, startingBid: 0, bidIncrement: 25, endsAt: new Date(endTime),
    });
    await expect(response.json()).resolves.toEqual({
      message: "Auction started", auctionStartsAt: now.toISOString(), auctionEndsAt: endTime,
    });
  });

  it.each([
    ["ends-in-past", 400, "End time must be in the future"],
    ["ladder-too-large", 400, "Starting bid plus increment is too large"],
    ["not-found", 404, "Listing not found"],
    ["not-seller", 403, "Only the seller can start this auction"],
    ["not-upcoming", 409, "Only an upcoming auction can be started"],
    ["not-approved", 409, "This listing must be approved by an admin before the auction can start."],
    ["already-started", 409, "Auction has already been started"],
    ["busy", 503, "The auction is busy. Please try again."],
  ] as const)("maps the %s rejection to %i", async (reason, status, error) => {
    mocks.startAuction.mockResolvedValue({ ok: false, reason });
    const response = await POST(request({ listingId, startingBid: 100, bidIncrement: 10, endTime }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });
});
