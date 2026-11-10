import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  claimView: vi.fn(),
  recordSeen: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => ({ engagement: { find: mocks.findUnique } }),
  withNativeTransaction: mocks.transaction,
}));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";

function request(body: unknown) {
  return new Request("http://localhost/api/listing-view", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/listing-view", () => {
  it("does not expose views or count visits for a private listing", async () => {
    mocks.findUnique.mockResolvedValue({ views: 7, status: "UPCOMING", reviewStatus: "PENDING", userId: "seller" });
    expect((await POST(request({ listingId }))).status).toBe(404);
    expect(mocks.claimView).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "viewer-1" });
    mocks.findUnique.mockResolvedValue({ views: 7, status: "LIVE", userId: "seller" });
    mocks.claimView.mockResolvedValue(8);
    mocks.recordSeen.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) =>
      callback({ engagement: { find: mocks.findUnique, claimView: mocks.claimView, recordSeen: mocks.recordSeen } })
    );
  });

  it("rejects an invalid listing ID before touching the database", async () => {
    const response = await POST(request({ listingId: "bad" }));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not mutate view counts for anonymous visitors", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await POST(request({ listingId }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ views: 7 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.claimView).not.toHaveBeenCalled();
  });

  it("uses the authenticated viewer and ignores an injected user ID", async () => {
    const response = await POST(
      request({ listingId, userId: "impersonated-user" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ views: 8 });
    expect(mocks.claimView).toHaveBeenCalledWith(listingId, "viewer-1", expect.any(Date));
    expect(mocks.recordSeen).toHaveBeenCalledWith("viewer-1", listingId, expect.any(Date));
  });

  it("does not increment a repeated authenticated view", async () => {
    mocks.claimView.mockResolvedValue(null);

    const response = await POST(request({ listingId }));

    await expect(response.json()).resolves.toEqual({ views: 7 });
    expect(mocks.recordSeen).not.toHaveBeenCalled();
  });

  it("returns not found without attempting a write", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(request({ listingId }));

    expect(response.status).toBe(404);
    expect(mocks.claimView).not.toHaveBeenCalled();
  });
});
