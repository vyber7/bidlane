import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toPublicListing } from "@/app/libs/listing-payload";
import { makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listingFindUnique: vi.fn(),
  setWatch: vi.fn(),
  snapshot: vi.fn(),
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
vi.mock("@/app/libs/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const listing = makeListing({ id: listingId });
let realtime: FakeRealtime;
beforeEach(() => { realtime = installFakeRealtime(); });
afterEach(() => realtime.uninstall());

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
    const personalEvents = realtime.published.filter(({ event }) => ["watchlist-update", "watching-update"].includes(event));
    expect(personalEvents).toHaveLength(2);
    for (const { channel } of personalEvents) expect(channel).toBe("user:user-1");
  });

  it("does not watch or broadcast the contents of an unapproved listing", async () => {
    mocks.listingFindUnique.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    expect((await POST(request({ listingId, watching: true }))).status).toBe(404);
    expect(mocks.setWatch).not.toHaveBeenCalled(); expect(realtime.published).toEqual([]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@test.dev" });
    mocks.listingFindUnique.mockResolvedValue(listing);
    mocks.setWatch.mockResolvedValue({ count: 1 });
    mocks.snapshot.mockResolvedValue({ listing: toPublicListing(listing, "user-1"), reviewStatus: listing.reviewStatus });
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
    expect(realtime.sent("user:user-1", "watchlist-update")).toEqual([{ listingId, userId: "user-1", watching }]);
    expect(realtime.sent("user:user-1", "watching-update")).toEqual([
      expect.objectContaining({
        listing: expect.objectContaining({
          createdAt: listing.createdAt.toISOString(),
          auctionEndsAt: listing.auctionEndsAt?.toISOString(),
          isWatching: watching,
          watcherCount: watching ? 2 : 1,
        }),
        watching,
      }),
    ]);
    expect(realtime.sent(`listing:${listingId}`, "watcher-count-update")).toEqual([{ listingId, watcherCount: watching ? 2 : 1 }]);
  });

  it("excludes private fields from every event and publishes only a count on public channels", async () => {
    const sensitive = { ...listing, reservePrice: 98765, reviewNote: "Private feedback", watchersIds: ["user-1", "other-watcher"], seenIds: ["private-viewer"], futureSecret: "secret" };
    mocks.listingFindUnique.mockResolvedValue(sensitive);
    mocks.snapshot.mockResolvedValue({ listing: { ...toPublicListing(sensitive, "user-1"), futureSecret: "secret" }, reviewStatus: sensitive.reviewStatus });
    expect((await POST(request({ listingId, watching: true }))).status).toBe(200);
    expect(realtime.published).toHaveLength(3);
    for (const { channel, event, payload } of realtime.published as Array<{ channel: string; event: string; payload: { listing?: object } }>) {
      if (!channel.startsWith("user:")) {
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
    expect(realtime.published).toEqual([]);
  });

  it("preserves the committed response when the notification snapshot cannot be loaded", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("Database unavailable after commit"));
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ listingId, watching: true });
    expect(mocks.setWatch).toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith("watchlist.realtime_update_failed", { listingId, userId: "user-1" });
  });

  it("keeps the successful response when real-time delivery fails", async () => {
    realtime.failSends();

    const response = await POST(request({ listingId, watching: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ listingId, watching: true });
    expect(mocks.loggerWarn).toHaveBeenCalledExactlyOnceWith(
      "watchlist.realtime_update_failed",
      expect.objectContaining({ listingId, userId: "user-1" }),
    );
  });
});
