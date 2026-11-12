import { MongoServerError } from "mongodb";
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ limit: vi.fn(),
  getCurrentUser: vi.fn(),
  transaction: vi.fn(),
  listingFindUnique: vi.fn(),
  listingUpdateMany: vi.fn(),
  bidCreate: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionCreate: vi.fn(),
  trigger: vi.fn(),
  notificationUpsert: vi.fn(),
}));

vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/native-repositories", () => ({ withNativeTransaction: mocks.transaction }));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));

import { POST } from "./route";
import { ApiRequestError } from "@/app/libs/api-request";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");
const tx = {
  auctions: { find: mocks.listingFindUnique, claimBid: mocks.listingUpdateMany, createBid: mocks.bidCreate },
  bidSubmissions: { find: mocks.submissionFindUnique, create: mocks.submissionCreate },
  notifications: { insertOnce: mocks.notificationUpsert },
};

const key = "test-bid-request-0001";

function request(body: unknown, idempotencyKey: string | null = key) {
  return new Request("http://localhost/api/place-bid", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(idempotencyKey === null ? {} : { "Idempotency-Key": idempotencyKey }) },
  });
}

function liveListing(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    userId: "seller",
    year: 2020, make: "Porsche", model: "911", highestBidderId: null,
    status: "LIVE",
    auctionStartsAt: new Date("2026-09-04T11:00:00.000Z"),
    auctionEndsAt: new Date("2026-09-04T13:00:00.000Z"),
    startingBid: 1_000,
    currentBid: null,
    bidIncrement: 100,
    ...overrides,
  };
}

describe("POST /api/place-bid", () => {
  it("requires verified email before creating a new bid", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "bidder", email: "bidder@test.dev", emailVerified: null });
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.bidCreate).not.toHaveBeenCalled();
  });
  it("blocks a throttled new bid before auction writes", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 15));
    const response = await POST(request({ listingId, bidAmount: 1000 }));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("15");
    expect(mocks.bidCreate).not.toHaveBeenCalled(); expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
  });
  it("replays accepted bids even if verification was revoked or the new-bid quota is exhausted", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "bidder", email: "bidder@test.dev", emailVerified: null });
    const accepted = { bid: { id: "accepted" }, currentBid: 1000 };
    mocks.submissionFindUnique.mockResolvedValue({ listingId, amount: 1000, response: accepted });
    mocks.limit.mockRejectedValue(new ApiRequestError(429, "Wait", 60));
    const response = await POST(request({ listingId, bidAmount: 1000 }));
    expect(response.status).toBe(201); await expect(response.json()).resolves.toEqual(accepted);
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.bidCreate).not.toHaveBeenCalled();
  });
  it("charges one quota attempt across transaction contention retries", async () => {
    mocks.submissionCreate.mockRejectedValueOnce(new MongoServerError({ message: "retry", code: 11000 }));
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    vi.clearAllMocks(); mocks.limit.mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getCurrentUser.mockResolvedValue({ id: "bidder", email: "bidder@test.dev", emailVerified: now });
    mocks.transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx)
    );
    mocks.submissionFindUnique.mockResolvedValue(null);
    mocks.submissionCreate.mockResolvedValue({});
    mocks.listingFindUnique.mockResolvedValue(liveListing());
    mocks.listingUpdateMany.mockResolvedValue({ count: 1 });
    mocks.bidCreate.mockResolvedValue({
      id: "bid-1",
      amount: 1_000,
      createdAt: now,
      listingId,
      userId: "bidder",
      user: { name: "Buyer" },
    });
    mocks.trigger.mockResolvedValue(undefined);
  });


  it.each([null, "", "short", "x".repeat(129), "invalid key with spaces"])("rejects invalid idempotency key %j before database work", async (key) => {
    const response = await POST(request({ listingId, bidAmount: 1000 }, key));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("replays the exact accepted response after the auction ends without repeating side effects", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ highestBidderId: "previous", currentBid: 900 }));
    const first = await POST(request({ listingId, bidAmount: 1000 }));
    const response = await first.json();
    const stored = mocks.submissionCreate.mock.calls[0][0];
    expect(stored).toEqual({ userId: "bidder", key, listingId, amount: 1000, response });
    mocks.submissionFindUnique.mockResolvedValue(stored);
    mocks.listingFindUnique.mockResolvedValue(liveListing({ status: "ENDED" }));
    const broadcastCount = mocks.trigger.mock.calls.length;

    const replay = await POST(request({ listingId, bidAmount: "1000" }));
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(response);
    expect(mocks.listingFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.listingUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.bidCreate).toHaveBeenCalledTimes(1);
    expect(mocks.submissionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.notificationUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.trigger).toHaveBeenCalledTimes(broadcastCount);
  });

  it.each([
    { listingId, bidAmount: 1100 },
    { listingId: "abcdef0123456789abcdef02", bidAmount: 1000 },
  ])("rejects key reuse with changed request data %j", async (body) => {
    mocks.submissionFindUnique.mockResolvedValue({ listingId, amount: 1000, response: {} });
    const response = await POST(request(body));
    expect(response.status).toBe(409);
    expect(mocks.listingFindUnique).not.toHaveBeenCalled();
    expect(mocks.bidCreate).not.toHaveBeenCalled();
  });

  it("scopes the key to the authenticated user", async () => {
    await POST(request({ listingId, bidAmount: 1000 }));
    mocks.getCurrentUser.mockResolvedValue({ id: "another-bidder", email: "another@test.dev" });
    await POST(request({ listingId, bidAmount: 1000 }));
    expect(mocks.submissionFindUnique).toHaveBeenNthCalledWith(1, "bidder", key);
    expect(mocks.submissionFindUnique).toHaveBeenNthCalledWith(2, "another-bidder", key);
  });

  it.each([11000])("replays a concurrently committed request after %s", async (code) => {
    const response = { bid: { id: "winning-bid" }, currentBid: 1000, auctionEndsAt: now.toISOString() };
    mocks.transaction.mockRejectedValueOnce(new MongoServerError({ message: "race", code }));
    mocks.submissionFindUnique.mockResolvedValue({ listingId, amount: 1000, response });
    const replay = await POST(request({ listingId, bidAmount: 1000 }));
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(response);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.bidCreate).not.toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("bounds transaction retries and returns a retryable failure", async () => {
    mocks.transaction.mockRejectedValue(new MongoServerError({ message: "race", code: 11000 }));
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(503);
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("does not reserve a key for a rejected bid", async () => {
    expect((await POST(request({ listingId, bidAmount: 900 }))).status).toBe(400);
    expect(mocks.submissionCreate).not.toHaveBeenCalled();
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(201);
  });

  it("fails before broadcasting if the request snapshot cannot be stored", async () => {
    mocks.submissionCreate.mockRejectedValueOnce(new Error("snapshot write failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(500);
    expect(mocks.trigger).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("requires authentication before opening a transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request({ listingId, bidAmount: 1_000 }))).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects sellers bidding on their own listings", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ userId: "bidder" }));

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(403);
    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["not live", { status: "UPCOMING" }],
    ["not started", { auctionStartsAt: new Date("2026-09-04T12:00:01.000Z") }],
    ["already ended", { auctionEndsAt: now }],
  ])("rejects an auction that is %s", async (_scenario, overrides) => {
    void _scenario;
    mocks.listingFindUnique.mockResolvedValue(liveListing(overrides));

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction is not open for bidding",
    });
  });

  it("enforces the starting bid and subsequent increment", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ currentBid: 1_500 }));

    const response = await POST(request({ listingId, bidAmount: 1_599 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Bid must be at least 1600",
    });
    expect(mocks.bidCreate).not.toHaveBeenCalled();
  });

  it("places a bid and updates bidder relationships atomically", async () => {
    const response = await POST(request({ listingId, bidAmount: "1000" }));

    expect(response.status).toBe(201);
    expect(mocks.listingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ id: listingId, currentBid: null, auctionEndsAt: new Date("2026-09-04T13:00:00.000Z") }),
      { amount: 1000, userId: "bidder", auctionEndsAt: new Date("2026-09-04T13:00:00.000Z") }, now,
    );
    expect(mocks.bidCreate).toHaveBeenCalledWith({ amount: 1000, listingId, userId: "bidder", createdAt: now });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { maxAttempts: 3, timeoutMS: 5000 });
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "new-bid",
      expect.objectContaining({ id: "bid-1", createdAt: now.toISOString() })
    );
  });

  it("keeps the exact previous-price lock for subsequent bids", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ currentBid: 1_500 }));
    const response = await POST(request({ listingId, bidAmount: 1_600 }));

    expect(response.status).toBe(201);
    const where = mocks.listingUpdateMany.mock.calls[0][0];
    expect(where.currentBid).toBe(1_500);
    expect(where).not.toHaveProperty("OR");
  });

  it("extends an auction to two minutes from a last-minute bid", async () => {
    mocks.listingFindUnique.mockResolvedValue(
      liveListing({ auctionEndsAt: new Date("2026-09-04T12:01:00.000Z") })
    );

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(201);
    expect(mocks.listingUpdateMany).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ auctionEndsAt: new Date("2026-09-04T12:02:00.000Z") }), now);
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "new-end-time",
      { newEndTime: "2026-09-04T12:02:00.000Z" }
    );
  });

  it("rejects a bid that loses the optimistic-lock race", async () => {
    mocks.listingUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(409);
    expect(mocks.bidCreate).not.toHaveBeenCalled();
    expect(mocks.notificationUpsert).not.toHaveBeenCalled();
  });

  it("stores an outbid event for the previous leader in the bid transaction", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ highestBidderId: "previous", currentBid: 900 }));
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(201);
    expect(mocks.notificationUpsert).toHaveBeenCalledWith(expect.objectContaining({ userId: "previous", eventKey: "outbid:bid-1", title: "You’ve been outbid", emailListingId: listingId }));
    expect(mocks.trigger).toHaveBeenCalledWith("private-user-previous", "notifications-changed", {});
  });

  it("fails the transaction before broadcasting if the outbid event cannot be saved", async () => {
    mocks.listingFindUnique.mockResolvedValue(liveListing({ highestBidderId: "previous", currentBid: 900 }));
    mocks.notificationUpsert.mockRejectedValueOnce(new Error("notification write failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(500);
    expect(mocks.trigger).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("returns a committed bid even if real-time notification fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("Pusher unavailable"));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(request({ listingId, bidAmount: 1_000 }));

    expect(response.status).toBe(201);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"bid.notification_failed"')
    );
    consoleWarn.mockRestore();
  });

  it("returns a retryable failure after the native callback budget is exhausted", async () => {
    mocks.transaction.mockRejectedValueOnce(new TransactionRetryLimitError());
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(503);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("does not rerun a transaction whose commit result is unknown", async () => {
    mocks.transaction.mockRejectedValueOnce(new MongoServerError({ message: "uncertain commit", code: 11000, errorLabels: ["UnknownTransactionCommitResult"] }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request({ listingId, bidAmount: 1000 }))).status).toBe(500);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.trigger).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
