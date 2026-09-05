import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listingFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  trigger: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/prismadb", () => ({
  default: {
    listing: { findUnique: mocks.listingFindUnique },
    user: { update: mocks.userUpdate },
  },
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const listing = { id: listingId, make: "Porsche", watchersIds: [] };

function request(body: unknown) {
  return new Request("http://localhost/api/update-watchlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/update-watchlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@test.dev" });
    mocks.listingFindUnique.mockResolvedValue(listing);
    mocks.userUpdate.mockResolvedValue({});
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request({ listingId, watching: true }))).status).toBe(401);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("requires an explicit desired watchlist state", async () => {
    const response = await POST(request({ listingId }));

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [true, "connect"],
    [false, "disconnect"],
  ])("persists and broadcasts watching=%s", async (watching, operation) => {
    const response = await POST(request({ listingId, watching }));

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        watchList: { [operation]: { id: listingId } },
      },
    });
    await expect(response.json()).resolves.toEqual({ listingId, watching });
    expect(mocks.trigger).toHaveBeenCalledWith(
      `listing-${listingId}`,
      "watchlist-update",
      { listingId, userId: "user-1", watching }
    );
  });

  it("keeps the successful response when real-time delivery fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("Pusher unavailable"));

    const response = await POST(request({ listingId, watching: true }));

    expect(response.status).toBe(200);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "watchlist.notification_failed",
      { listingId, userId: "user-1" }
    );
  });
});
