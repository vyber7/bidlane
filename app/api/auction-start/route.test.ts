import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");

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
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getCurrentUser.mockResolvedValue({ id: "seller", email: "seller@test.dev" });
    mocks.findUnique.mockResolvedValue({
      id: listingId,
      userId: "seller",
      status: "UPCOMING",
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires an authenticated user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request({}));

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("validates the request before querying the listing", async () => {
    const response = await POST(
      request({ listingId: "bad", startingBid: 100, bidIncrement: 10, endTime: now })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid listing ID" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an end time that is not in the future", async () => {
    const response = await POST(
      request({ listingId, startingBid: 0, bidIncrement: 10, endTime: now.toISOString() })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "End time must be in the future",
    });
  });

  it("allows only the seller to start an upcoming auction", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "another-seller", status: "UPCOMING" });

    const response = await POST(
      request({
        listingId,
        startingBid: 100,
        bidIncrement: 10,
        endTime: "2026-09-05T12:00:00.000Z",
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("starts an auction atomically", async () => {
    const endTime = "2026-09-05T12:00:00.000Z";

    const response = await POST(
      request({ listingId, startingBid: "0", bidIncrement: "25", endTime })
    );

    expect(response.status).toBe(201);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: listingId, userId: "seller", status: "UPCOMING" },
      data: {
        auctionStartsAt: now,
        auctionEndsAt: new Date(endTime),
        startingBid: 0,
        bidIncrement: 25,
        status: "LIVE",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      message: "Auction started",
      auctionStartsAt: now.toISOString(),
      auctionEndsAt: endTime,
    });
  });

  it("reports a competing start request as a conflict", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(
      request({
        listingId,
        startingBid: 100,
        bidIncrement: 10,
        endTime: "2026-09-05T12:00:00.000Z",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction has already been started",
    });
  });
});
