import { MongoError, MongoServerError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";

// Data behaviour is tested against real MongoDB in
// prisma/native/engagement.integration.test.ts. These cover each command's
// rejections, contention policy and real-time updates.
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  createComment: vi.fn(),
  touchComment: vi.fn(),
  setWatch: vi.fn(),
  watchSnapshot: vi.fn(),
  insertOnce: vi.fn(),
  transaction: vi.fn(),
  limit: vi.fn(),
  ownedAssets: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("./native-repositories", () => ({
  withNativeTransaction: mocks.transaction,
  getNativeRepositories: () => ({ engagement: { watchSnapshot: mocks.watchSnapshot } }),
}));
vi.mock("./abuse-limits", () => ({ enforceAbuseLimit: mocks.limit }));
vi.mock("./uploaded-assets", () => ({ assertOwnedAssets: mocks.ownedAssets }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));

import { ApiRequestError } from "./api-request";
import { toPublicListing } from "./listing-payload";
import { installFakeRealtime, type FakeRealtime } from "./realtime/testing";
import { postComment, setWatch } from "./engagement-commands";

const listing = makeListing({ status: "LIVE" });
const author = { id: "buyer" };
const savedComment = {
  id: "comment-1",
  listingId: listing.id,
  body: "Great car",
  image: null,
  createdAt: auctionNow,
  user: { name: "Driver" },
};
const publicComment = { ...savedComment, createdAt: auctionNow.toISOString() };

let realtime: FakeRealtime;
beforeEach(() => {
  vi.clearAllMocks();
  realtime = installFakeRealtime();
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work({
    engagement: { find: mocks.find, touchComment: mocks.touchComment, setWatch: mocks.setWatch },
    comments: { create: mocks.createComment },
    notifications: { insertOnce: mocks.insertOnce },
  }));
  mocks.find.mockResolvedValue(listing);
  mocks.createComment.mockResolvedValue(savedComment);
  mocks.touchComment.mockResolvedValue({ count: 1 });
  mocks.setWatch.mockResolvedValue({ count: 1 });
  mocks.watchSnapshot.mockResolvedValue({
    listing: toPublicListing({ ...listing, watchersIds: ["buyer", "other"] }, "buyer"),
    reviewStatus: listing.reviewStatus,
  });
});
afterEach(() => realtime.uninstall());

const comment = { author, listingId: listing.id, body: "Great car" };

describe("posting a comment", () => {
  it("saves the comment, notifies the seller and publishes both real-time updates", async () => {
    await expect(postComment(comment, () => auctionNow)).resolves.toEqual({ ok: true, comment: publicComment });

    expect(mocks.limit).toHaveBeenCalledWith("comment", "buyer");
    expect(mocks.createComment).toHaveBeenCalledWith({ listingId: listing.id, userId: "buyer", body: "Great car", image: undefined }, auctionNow);
    expect(mocks.insertOnce).toHaveBeenCalledWith(expect.objectContaining({ userId: "seller", eventKey: "comment:comment-1" }));
    expect(realtime.published).toEqual([
      { channel: `listing:${listing.id}`, event: "new-comment", payload: publicComment },
      { channel: "user:seller", event: "notifications-changed", payload: {} },
    ]);
  });

  it("checks an attached image belongs to the commenter for this Listing", async () => {
    await postComment({ ...comment, image: "https://res.cloudinary.com/x/photo.jpg" });
    expect(mocks.ownedAssets).toHaveBeenCalledWith({ userId: "buyer", kind: "PHOTO", urls: ["https://res.cloudinary.com/x/photo.jpg"], listingId: listing.id });
  });

  it("enforces the comment quota before any transaction work", async () => {
    mocks.limit.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(postComment(comment)).rejects.toThrow("quota exceeded");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
  });

  it("saves and sends nothing when the attached image isn't the commenter's", async () => {
    const notOwned = new ApiRequestError(400, "Use files uploaded through your BidLane account.");
    mocks.ownedAssets.mockRejectedValueOnce(notOwned);
    await expect(postComment({ ...comment, image: "https://res.cloudinary.com/x/borrowed.jpg" })).rejects.toBe(notOwned);
    expect(mocks.createComment).not.toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
  });

  it("rejects a Listing that doesn't exist", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(postComment(comment)).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(mocks.createComment).not.toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
  });

  it("rejects a Listing that isn't public yet", async () => {
    mocks.find.mockResolvedValue(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    await expect(postComment(comment)).resolves.toEqual({ ok: false, reason: "not-public" });
    expect(mocks.createComment).not.toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
  });

  it("rejects a comment whose Listing left public view during the transaction", async () => {
    mocks.touchComment.mockResolvedValue({ count: 0 });
    await expect(postComment(comment)).resolves.toEqual({ ok: false, reason: "not-public" });
    expect(mocks.createComment).not.toHaveBeenCalled();
    expect(realtime.published).toEqual([]);
  });

  it.each([
    ["an exhausted retry budget", () => new TransactionRetryLimitError()],
    ["a transient transaction error", () => {
      const error = new MongoError("write conflict");
      error.addErrorLabel("TransientTransactionError");
      return error;
    }],
  ])("reports %s as busy", async (_case, contention) => {
    mocks.transaction.mockRejectedValue(contention());
    await expect(postComment(comment)).resolves.toEqual({ ok: false, reason: "busy" });
  });

  it("lets other failures propagate", async () => {
    mocks.transaction.mockRejectedValue(new MongoServerError({ message: "disk full" }));
    await expect(postComment(comment)).rejects.toThrow("disk full");
  });

  it("returns the saved comment even if its real-time updates fail", async () => {
    realtime.failSends();
    await expect(postComment(comment, () => auctionNow)).resolves.toEqual({ ok: true, comment: publicComment });
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith("comment.realtime_update_failed", expect.objectContaining({ listingId: listing.id }));
  });
});

const watch = { watcher: { id: "buyer" }, listingId: listing.id, watching: true };

describe("watching a Listing", () => {
  it("records the Watcher and publishes the Watchlist updates and watcher count", async () => {
    await expect(setWatch(watch)).resolves.toEqual({ ok: true, watching: true });
    expect(mocks.setWatch).toHaveBeenCalledWith(listing.id, "buyer", true);
    expect(realtime.sent("user:buyer", "watchlist-update")).toEqual([{ listingId: listing.id, userId: "buyer", watching: true }]);
    expect(realtime.sent("user:buyer", "watching-update")).toEqual([
      expect.objectContaining({ watching: true, listing: expect.objectContaining({ id: listing.id, watcherCount: 2 }) }),
    ]);
    expect(realtime.sent(`listing:${listing.id}`, "watcher-count-update")).toEqual([{ listingId: listing.id, watcherCount: 2 }]);
  });

  it("sends no private Listing fields, and only a count on the Listing's public channel", async () => {
    const sensitive = { ...listing, reservePrice: 98765, reviewNote: "Private feedback", watchersIds: ["buyer", "other"], seenIds: ["private-viewer"] };
    mocks.watchSnapshot.mockResolvedValue({ listing: { ...toPublicListing(sensitive, "buyer"), futureSecret: "secret" }, reviewStatus: sensitive.reviewStatus });
    await setWatch(watch);

    expect(realtime.published.filter(({ channel }) => !channel.startsWith("user:"))).toEqual([
      { channel: `listing:${listing.id}`, event: "watcher-count-update", payload: { listingId: listing.id, watcherCount: 2 } },
    ]);
    const [{ listing: sent }] = realtime.sent("user:buyer", "watching-update") as Array<{ listing: object }>;
    for (const field of ["reservePrice", "watchersIds", "seenIds", "reviewNote", "futureSecret"]) expect(sent).not.toHaveProperty(field);
  });

  it("hides a Listing that doesn't exist or isn't public behind not-found", async () => {
    mocks.find.mockResolvedValueOnce(null);
    await expect(setWatch(watch)).resolves.toEqual({ ok: false, reason: "not-found" });
    mocks.find.mockResolvedValueOnce(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" }));
    await expect(setWatch(watch)).resolves.toEqual({ ok: false, reason: "not-found" });
    mocks.setWatch.mockResolvedValueOnce({ count: 0 });
    await expect(setWatch(watch)).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(realtime.published).toEqual([]);
  });

  it("records the change but sends nothing when the Listing left public view after commit", async () => {
    mocks.watchSnapshot.mockResolvedValue({
      listing: toPublicListing(makeListing({ status: "UPCOMING", reviewStatus: "PENDING" })),
      reviewStatus: "PENDING",
    });
    await expect(setWatch(watch)).resolves.toEqual({ ok: true, watching: true });
    expect(realtime.published).toEqual([]);
  });

  it("keeps a recorded change when the snapshot for its real-time updates can't be read", async () => {
    mocks.watchSnapshot.mockRejectedValue(new Error("Database unavailable after commit"));
    await expect(setWatch(watch)).resolves.toEqual({ ok: true, watching: true });
    expect(realtime.published).toEqual([]);
    expect(mocks.warn).toHaveBeenCalledWith("watchlist.realtime_update_failed", { listingId: listing.id, userId: "buyer" });
  });

  it("keeps a recorded change when its real-time updates fail", async () => {
    realtime.failSends();
    await expect(setWatch({ ...watch, watching: false })).resolves.toEqual({ ok: true, watching: false });
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith("watchlist.realtime_update_failed", expect.objectContaining({ listingId: listing.id, userId: "buyer" }));
  });

  it("reports transaction contention as busy", async () => {
    mocks.transaction.mockRejectedValue(new TransactionRetryLimitError());
    await expect(setWatch(watch)).resolves.toEqual({ ok: false, reason: "busy" });
  });
});
