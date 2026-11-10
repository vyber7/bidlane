import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ limit: vi.fn(),
  getCurrentUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  trigger: vi.fn(),
  findUnique: vi.fn(),
  insertOnce: vi.fn(),
  assets: vi.fn(),
}));

vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => ({ assets: { findOwned: mocks.assets } }),
  withNativeTransaction: async (callback: (tx: unknown) => unknown) => callback({
    comments: { create: mocks.create }, engagement: { find: mocks.findUnique, touchComment: mocks.update },
    notifications: { insertOnce: mocks.insertOnce },
  }),
}));
vi.mock("@/app/libs/abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.getCurrentUser }));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "./route";
import { ApiRequestError } from "@/app/libs/api-request";

const listingId = "abcdef0123456789abcdef01";

function request(body: unknown) {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/comments", () => {
  it("blocks comment spam before transaction writes or notifications", async () => {
    mocks.limit.mockRejectedValueOnce(new ApiRequestError(429, "Wait", 23));
    const response = await POST(request({ listingId, comment: "Hello" }));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("23");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("rejects oversized comments before transaction work", async () => {
    expect((await POST(request({ listingId, comment: "x".repeat(4001) }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unregistered attachment URLs without creating or broadcasting a comment", async () => {
    expect((await POST(request({ listingId, comment: "Hello", image: "https://res.cloudinary.com/demo/image/upload/borrowed.jpg" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("does not post or broadcast comments on an unapproved listing", async () => {
    mocks.findUnique.mockResolvedValue({ id: listingId, userId: "seller", status: "UPCOMING", reviewStatus: "PENDING" });
    expect((await POST(request({ listingId, comment: "Hello" }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks(); mocks.limit.mockResolvedValue(undefined); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockResolvedValue([]);
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "driver@example.com",
    });
    mocks.create.mockResolvedValue({
      id: "comment-1",
      body: "Great car",
      image: null,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
      listingId,
      user: { name: "Driver" },
    });
    mocks.findUnique.mockResolvedValue({ id: listingId, userId: "seller", status: "LIVE", year: 2020, make: "Porsche", model: "911" });
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("broadcasts and returns only the public comment author shape", async () => {
    const response = await POST(request({ listingId, comment: " Great car " }));

    expect(response.status).toBe(201);
    expect(mocks.insertOnce).toHaveBeenCalledWith(expect.objectContaining({ userId: "seller", title: "New comment on your listing" }));
    expect(mocks.create).toHaveBeenCalledWith({ listingId, userId: "user-1", body: "Great car", image: undefined }, expect.any(Date));
    const payload = mocks.trigger.mock.calls.find((call) => call[1] === "new-comment")![2];
    expect(payload.createdAt).toBe("2026-09-10T12:00:00.000Z");
    expect(payload.user).toEqual({ name: "Driver" });
    expect(payload.user).not.toHaveProperty("hashedPassword");
    await expect(response.json()).resolves.toEqual({
      comment: {
        id: "comment-1",
        body: "Great car",
        image: null,
        createdAt: "2026-09-10T12:00:00.000Z",
        listingId,
        user: { name: "Driver" },
      },
    });
  });

  it("requires authentication before creating a comment", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request({ listingId, comment: "Great car" }))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid listing ID before writing", async () => {
    const response = await POST(request({ listingId: "bad", comment: "Great car" }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());
