import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/app/libs/api-request";
import type { BidOutcome } from "@/app/libs/auction-commands";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), placeBid: vi.fn() }));

vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.getCurrentUser }));
vi.mock("@/app/libs/auction-commands", () => ({ placeBid: mocks.placeBid }));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const key = "test-bid-request-0001";
const bidder = { id: "bidder", email: "bidder@test.dev", emailVerified: new Date("2026-09-01T00:00:00.000Z") };

function request(body: unknown, idempotencyKey: string | null = key) {
  return new Request("http://localhost/api/place-bid", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(idempotencyKey === null ? {} : { "Idempotency-Key": idempotencyKey }) },
  });
}

const response = {
  bid: { id: "bid-1", amount: 1000, listingId, userId: "bidder", user: { name: "Buyer" }, createdAt: "2026-09-04T12:00:00.000Z" },
  currentBid: 1000,
  auctionEndsAt: "2026-09-04T13:00:00.000Z",
};

describe("POST /api/place-bid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(bidder);
    mocks.placeBid.mockResolvedValue({ ok: true, replayed: false, response } satisfies BidOutcome);
  });

  it("requires authentication before placing a bid", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(401);
    expect(mocks.placeBid).not.toHaveBeenCalled();
  });

  it.each([null, "", "short", "x".repeat(129), "invalid key with spaces"])("rejects invalid idempotency key %j before placing a bid", async (key) => {
    expect((await POST(request({ listingId, bidAmount: 1000 }, key))).status).toBe(400);
    expect(mocks.placeBid).not.toHaveBeenCalled();
  });

  it("places the parsed bid for the signed-in bidder under their key", async () => {
    const accepted = await POST(request({ listingId, bidAmount: "1000" }));
    expect(accepted.status).toBe(201);
    await expect(accepted.json()).resolves.toEqual(response);
    expect(mocks.placeBid).toHaveBeenCalledWith({ bidder, listingId, amount: 1000, key });
  });

  it("returns a replayed bid exactly as first accepted", async () => {
    mocks.placeBid.mockResolvedValue({ ok: true, replayed: true, response } satisfies BidOutcome);
    const replay = await POST(request({ listingId, bidAmount: 1000 }));
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toEqual(response);
  });

  it.each([
    [{ reason: "key-reused" }, 409, "Idempotency-Key was already used for a different bid"],
    [{ reason: "unverified" }, 403, "Verify your email in Account → Profile before you bid."],
    [{ reason: "not-found" }, 404, "Listing not found"],
    [{ reason: "own-listing" }, 403, "Sellers cannot bid on their listing"],
    [{ reason: "not-open" }, 409, "Auction is not open for bidding"],
    [{ reason: "unconfigured" }, 409, "Auction bidding is not configured"],
    [{ reason: "limit-reached" }, 409, "Auction cannot accept a higher bid"],
    [{ reason: "below-minimum", minimumBid: 1600 }, 400, "Bid must be at least 1600"],
    [{ reason: "outpaced" }, 409, "The auction changed while placing this bid; please try again"],
    [{ reason: "busy" }, 503, "Bidding is busy; retry this same request"],
  ] as const)("maps the %j rejection to %i", async (rejection, status, error) => {
    mocks.placeBid.mockResolvedValue({ ok: false, ...rejection });
    const rejected = await POST(request({ listingId, bidAmount: 1000 }));
    expect(rejected.status).toBe(status);
    await expect(rejected.json()).resolves.toEqual({ error });
  });

  it("passes a quota refusal through with its retry hint", async () => {
    mocks.placeBid.mockRejectedValue(new ApiRequestError(429, "Wait", 15));
    const throttled = await POST(request({ listingId, bidAmount: 1000 }));
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).toBe("15");
  });

  it("hides unexpected failures behind a 500", async () => {
    mocks.placeBid.mockRejectedValue(new Error("snapshot write failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(500);
    log.mockRestore();
  });
});
