import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeBid,
  makeComment,
  makeListing,
  auctionNow,
} from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({ trigger: vi.fn(), warn: vi.fn() }));
vi.mock("./pusher", () => ({ pusherServer: { trigger: mocks.trigger } }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));
import {
  auctionLiveNotifications,
  auctionResultNotifications,
  commentNotifications,
  outbidNotifications,
  publishNotificationChanges,
  saveNotifications,
} from "./notifications";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trigger.mockResolvedValue(undefined);
});

describe("notification events", () => {
  it("alerts only the displaced bidder, without a self-outbid or first-bid alert", () => {
    const bid = { ...makeBid(), createdAt: auctionNow };
    expect(outbidNotifications(makeListing(), bid)).toEqual([]);
    expect(
      outbidNotifications(makeListing({ highestBidderId: bid.userId }), bid),
    ).toEqual([]);
    expect(
      outbidNotifications(makeListing({ highestBidderId: "previous" }), bid),
    ).toEqual([
      expect.objectContaining({
        userId: "previous",
        eventKey: "outbid:bid-1",
        title: "You’ve been outbid",
        tone: "warning",
        createdAt: auctionNow,
      }),
    ]);
    expect(
      outbidNotifications(makeListing({ highestBidderId: "previous" }), {
        ...bid,
        id: "bid-2",
      })[0].eventKey,
    ).toBe("outbid:bid-2");
  });

  it("records the winner, seller, and other bidders once each with the actual closing time", () => {
    const listing = makeListing({
      biddersIds: ["buyer", "loser", "loser", "seller"],
      highestBidderId: "buyer",
    });
    const items = auctionResultNotifications(listing, "SOLD", auctionNow);
    expect(items.map((item) => item.userId)).toEqual([
      "seller",
      "buyer",
      "loser",
    ]);
    expect(items[0]).toMatchObject({
      title: "Your vehicle sold",
      actionLabel: "Contact buyer",
      href: "/account/shipments",
    });
    expect(items[1]).toMatchObject({
      title: "You won the auction",
      actionLabel: "Contact seller",
      tone: "success",
    });
    expect(items[2]).toMatchObject({ title: "Auction ended", tone: "neutral" });
    expect(
      items.every(
        (item) =>
          item.createdAt === auctionNow &&
          item.eventKey === `auction-ended:${listing.id}`,
      ),
    ).toBe(true);
  });

  it("never claims a winner or sale when the reserve was not met", () => {
    const items = auctionResultNotifications(
      makeListing({ highestBidderId: "buyer" }),
      "RESERVE_NOT_MET",
      auctionNow,
    );
    expect(items.map((item) => item.title)).toEqual([
      "Your auction ended",
      "Auction ended",
    ]);
    expect(items.every((item) => item.tone === "neutral")).toBe(true);
    expect(
      auctionResultNotifications(makeListing(), "RESERVE_NOT_MET", auctionNow),
    ).toHaveLength(1);
  });

  it("preserves watched-auction and buyer-question alerts without notifying the actor", () => {
    const listing = makeListing({
      watchersIds: ["watcher", "watcher", "seller"],
    });
    expect(auctionLiveNotifications(listing, auctionNow)).toEqual([
      expect.objectContaining({
        userId: "watcher",
        eventKey: `auction-live:${listing.id}`,
      }),
    ]);
    const comment = {
      ...makeComment(),
      createdAt: auctionNow,
      body: "x".repeat(101),
    };
    expect(commentNotifications(listing, comment, "seller")).toEqual([]);
    expect(commentNotifications(listing, comment, "buyer")[0]).toMatchObject({
      userId: "seller",
      eventKey: "comment:comment-1",
      message: `Buyer commented on your 2020 Porsche 911: “${"x".repeat(100)}…”`,
    });
  });

  it("uses a stable uniqueness key and never resets an existing read timestamp on replay", async () => {
    const upsert = vi.fn().mockResolvedValue({ readAt: auctionNow });
    const tx = { notification: { upsert } } as unknown as Parameters<
      typeof saveNotifications
    >[0];
    const events = auctionResultNotifications(
      makeListing({ highestBidderId: "buyer" }),
      "SOLD",
      auctionNow,
    );
    await saveNotifications(tx, events);
    await saveNotifications(tx, events);
    expect(upsert).toHaveBeenCalledTimes(4);
    expect(upsert.mock.calls[0][0]).toEqual(upsert.mock.calls[2][0]);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_eventKey: {
          userId: "buyer",
          eventKey: `auction-ended:${makeListing().id}`,
        },
      },
      create: expect.objectContaining({ userId: "buyer", readAt: null }),
      update: {},
    });
  });

  it("keeps persisted events available if live delivery fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("offline"));
    await expect(
      publishNotificationChanges(["buyer", "buyer"]),
    ).resolves.toBeUndefined();
    expect(mocks.trigger).toHaveBeenCalledExactlyOnceWith(
      "private-user-buyer",
      "notifications-changed",
      {},
    );
    expect(mocks.warn).toHaveBeenCalledWith(
      "notification.live_update_failed",
      {},
    );
  });

  it("queues outbid email atomically without requeuing it on an event replay", async () => {
    const upsert = vi.fn();
    const tx = { notification: { upsert } } as unknown as Parameters<
      typeof saveNotifications
    >[0];
    const events = outbidNotifications(
      makeListing({ highestBidderId: "previous" }),
      { ...makeBid(), createdAt: auctionNow },
    );
    await saveNotifications(tx, events);
    await saveNotifications(tx, events);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      create: {
        emailListingId: makeListing().id,
        emailStatus: "PENDING",
        emailNextAttemptAt: expect.any(Date),
      },
      update: {},
    });
    expect(upsert.mock.calls[1][0].update).toEqual({});
  });
});
