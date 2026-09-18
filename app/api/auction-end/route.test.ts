import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  finalizeAuction: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
    },
  },
}));
vi.mock("@/app/libs/auction-finalization", () => ({
  finalizeAuction: mocks.finalizeAuction,
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const now = new Date("2026-09-04T12:00:00.000Z");

function request(body: unknown = { listingId }) {
  return new Request("http://localhost/api/auction-end", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auction-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getCurrentUser.mockResolvedValue({ id: "seller", email: "seller@test.dev" });
    mocks.findUnique.mockResolvedValue({
      id: listingId,
      userId: "seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
      currentBid: 12_000,
      reservePrice: 10_000,
    });
    mocks.finalizeAuction.mockResolvedValue({
      status: "finalized",
      result: "SOLD",
      auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
    });
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request())).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("allows only the listing seller to end the auction", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "another-seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T11:59:00.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.finalizeAuction).not.toHaveBeenCalled();
  });

  it("does not allow an auction to end early", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "seller",
      status: "LIVE",
      auctionEndsAt: new Date("2026-09-04T12:00:01.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction cannot end before its scheduled time",
    });
  });

  it("delegates an eligible auction to the shared finalizer", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.finalizeAuction).toHaveBeenCalledWith(listingId, now);
    await expect(response.json()).resolves.toEqual({
      message: "Auction ended successfully",
      result: "SOLD",
    });
  });

  it("reports a competing end request as a conflict", async () => {
    mocks.finalizeAuction.mockResolvedValue({
      status: "already_finalized",
      result: "SOLD",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction has already ended",
    });
  });
});
