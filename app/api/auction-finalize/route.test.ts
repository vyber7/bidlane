import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ finalizeAuction: vi.fn() }));

vi.mock("@/app/libs/auction-finalization", () => ({
  finalizeAuction: mocks.finalizeAuction,
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";

function request(body: unknown = { listingId }) {
  return new Request("http://localhost/api/auction-finalize", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auction-finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.finalizeAuction.mockResolvedValue({
      status: "finalized",
      result: "SOLD",
      auctionEndsAt: new Date("2026-09-10T12:00:00.000Z"),
    });
  });

  it("validates the listing ID", async () => {
    const response = await POST(request({ listingId: "invalid" }));

    expect(response.status).toBe(400);
    expect(mocks.finalizeAuction).not.toHaveBeenCalled();
  });

  it("allows an expired auction to be finalized", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.finalizeAuction).toHaveBeenCalledWith(listingId);
    await expect(response.json()).resolves.toMatchObject({
      status: "finalized",
      result: "SOLD",
    });
  });

  it("is idempotent when the auction already ended", async () => {
    mocks.finalizeAuction.mockResolvedValue({
      status: "already_finalized",
      result: "SOLD",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "already_finalized",
      result: "SOLD",
    });
  });

  it("rejects an early finalization request", async () => {
    mocks.finalizeAuction.mockResolvedValue({
      status: "not_due",
      auctionEndsAt: new Date("2026-09-10T12:01:00.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Auction cannot end before its scheduled time",
    });
  });
});
