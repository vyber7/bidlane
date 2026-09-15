import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ finalizeExpiredAuctions: vi.fn() }));

vi.mock("@/app/libs/auction-finalization", () => ({
  finalizeExpiredAuctions: mocks.finalizeExpiredAuctions,
}));

import { GET } from "./route";

function request(secret = "test-cron-secret") {
  return new Request("http://localhost/api/cron/finalize-auctions", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/finalize-auctions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mocks.finalizeExpiredAuctions.mockResolvedValue({
      checked: 2,
      finalized: 2,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is missing", async () => {
    delete process.env.CRON_SECRET;

    expect((await GET(request())).status).toBe(401);
    expect(mocks.finalizeExpiredAuctions).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    expect((await GET(request("wrong-secret"))).status).toBe(401);
    expect(mocks.finalizeExpiredAuctions).not.toHaveBeenCalled();
  });

  it("runs an authenticated finalization batch", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checked: 2,
      finalized: 2,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
  });

  it("returns a failure status when any auction could not be processed", async () => {
    mocks.finalizeExpiredAuctions.mockResolvedValue({
      checked: 2,
      finalized: 1,
      skipped: 0,
      failed: 1,
      hasMore: false,
    });

    expect((await GET(request())).status).toBe(500);
  });
});
