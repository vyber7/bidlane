import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  listingUpdateMany: vi.fn(),
  userUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "viewer-1" });
    mocks.findUnique.mockResolvedValue({ views: 7 });
    mocks.listingUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        listing: {
          findUnique: mocks.findUnique,
          updateMany: mocks.listingUpdateMany,
        },
        user: { updateMany: mocks.userUpdateMany },
      })
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
    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
  });

  it("uses the authenticated viewer and ignores an injected user ID", async () => {
    const response = await POST(
      request({ listingId, userId: "impersonated-user" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ views: 8 });
    expect(mocks.listingUpdateMany).toHaveBeenCalledWith({
      where: {
        id: listingId,
        views: { lt: 2_147_483_647 },
        NOT: { seenIds: { has: "viewer-1" } },
      },
      data: {
        views: { increment: 1 },
        seenIds: { push: "viewer-1" },
      },
    });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "viewer-1",
        NOT: { seenListIds: { has: listingId } },
      },
      data: { seenListIds: { push: listingId } },
    });
  });

  it("does not increment a repeated authenticated view", async () => {
    mocks.listingUpdateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request({ listingId }));

    await expect(response.json()).resolves.toEqual({ views: 7 });
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it("returns not found without attempting a write", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(request({ listingId }));

    expect(response.status).toBe(404);
    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
  });
});
