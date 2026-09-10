import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  trigger: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    comment: { create: mocks.create },
    listing: { update: mocks.update },
  },
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";

function request(body: unknown) {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.update.mockResolvedValue({ id: listingId });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("broadcasts and returns only the public comment author shape", async () => {
    const response = await POST(request({ listingId, comment: " Great car " }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          user: { select: { name: true } },
        }),
      })
    );
    const payload = mocks.trigger.mock.calls[0][2];
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
