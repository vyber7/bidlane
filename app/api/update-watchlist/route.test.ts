import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPublicListing } from "@/app/libs/listing-payload";
import { makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listingFindUnique: vi.fn(),
  setWatch: vi.fn(),
  snapshot: vi.fn(),
  trigger: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => ({ engagement: { watchSnapshot: mocks.snapshot } }),
  withNativeTransaction: async (callback: (tx: unknown) => unknown) => callback({ engagement: { find: mocks.listingFindUnique, setWatch: mocks.setWatch } }),
}));
vi.mock("@/app/libs/pusher", () => ({
  pusherServer: { trigger: mocks.trigger },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const listing = makeListing({ id: listingId });

function request(body: unknown) {
  return new Request("http://localhost/api/update-watchlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/update-watchlist", () => {
  it("publishes personal watch activity only on the authenticated private user channel", async () => {
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(200);
    const personalEvents = mocks.trigger.mock.calls.filter(([, event]) => ["watchlist-update", "watching-update"].includes(event));
    expect(personalEvents).toHaveLength(2);
    for (const [channel] of personalEvents) expect(channel).toBe("private-user-user-1");
  });

  it("does not watch or broadcast the contents of an unapproved listing", async () => {
    mocks.listingFindUnique.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    expect((await POST(request({ listingId, watching: true }))).status).toBe(404);
    expect(mocks.setWatch).not.toHaveBeenCalled(); expect(mocks.trigger).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@test.dev" });
    mocks.listingFindUnique.mockResolvedValue(listing);
    mocks.setWatch.mockResolvedValue({ count: 1 });
    mocks.snapshot.mockResolvedValue({ listing: toPublicListing(listing, "user-1"), reviewStatus: listing.reviewStatus });
    mocks.trigger.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request({ listingId, watching: true }))).status).toBe(401);
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it("requires an explicit desired watchlist state", async () => {
    const response = await POST(request({ listingId }));

    expect(response.status).toBe(400);
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it.each(["bad-id", "g".repeat(24), "a".repeat(23), 123, null])("rejects listing ID %j before querying the database", async (listingId) => {
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid listing ID" });
    expect(mocks.listingFindUnique).not.toHaveBeenCalled();
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it("keeps unexpected database failures private and returns JSON", async () => {
    mocks.setWatch.mockRejectedValueOnce(new SyntaxError("private database decoding details"));
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to update watchlist" });
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it.each([
    [true],
    [false],
  ])("persists and broadcasts watching=%s", async (watching) => {
    mocks.snapshot.mockResolvedValue({ listing: toPublicListing({ ...listing, watchersIds: watching ? ["user-1", "other-watcher"] : ["other-watcher"] }, "user-1"), reviewStatus: listing.reviewStatus });
    const response = await POST(request({ listingId, watching }));

    expect(response.status).toBe(200);
    expect(mocks.setWatch).toHaveBeenCalledWith(listingId, "user-1", watching);
    await expect(response.json()).resolves.toEqual({ listingId, watching });
    expect(mocks.trigger).toHaveBeenCalledWith(
      "private-user-user-1",
      "watchlist-update",
      { listingId, userId: "user-1", watching }
    );
    expect(mocks.trigger).toHaveBeenCalledWith(
      "private-user-user-1",
      "watching-update",
      expect.objectContaining({
        listing: expect.objectContaining({
          createdAt: listing.createdAt.toISOString(),
          auctionEndsAt: listing.auctionEndsAt?.toISOString(),
          isWatching: watching,
          watcherCount: watching ? 2 : 1,
        }),
        watching,
      })
    );
    expect(mocks.trigger).toHaveBeenCalledWith(`listing-${listingId}`, "watcher-count-update", { listingId, watcherCount: watching ? 2 : 1 });
  });

  it("excludes private fields from every event and publishes only a count on public channels", async () => {
    const sensitive = { ...listing, reservePrice: 98765, reviewNote: "Private feedback", watchersIds: ["user-1", "other-watcher"], seenIds: ["private-viewer"], futureSecret: "secret" };
    mocks.listingFindUnique.mockResolvedValue(sensitive);
    mocks.snapshot.mockResolvedValue({ listing: { ...toPublicListing(sensitive, "user-1"), futureSecret: "secret" }, reviewStatus: sensitive.reviewStatus });
    expect((await POST(request({ listingId, watching: true }))).status).toBe(200);
    for (const [channel, event, payload] of mocks.trigger.mock.calls) {
      if (!channel.startsWith("private-")) {
        expect(event).toBe("watcher-count-update");
        expect(payload).toEqual({ listingId, watcherCount: 2 });
      }
      if (event === "watching-update") {
        for (const field of ["reservePrice", "watchersIds", "seenIds", "reviewNote", "futureSecret"]) expect(payload.listing).not.toHaveProperty(field);
      }
    }
  });

  it("does not disclose a listing that became private while updating the relation", async () => {
    mocks.snapshot.mockResolvedValue({ listing: toPublicListing({ ...listing, status: "UPCOMING", reviewStatus: "PENDING" }), reviewStatus: "PENDING" });
    expect((await POST(request({ listingId, watching: true }))).status).toBe(200);
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("preserves the committed response when the notification snapshot cannot be loaded", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("Database unavailable after commit"));
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ listingId, watching: true });
    expect(mocks.setWatch).toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith("watchlist.notification_failed", { listingId, userId: "user-1" });
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
