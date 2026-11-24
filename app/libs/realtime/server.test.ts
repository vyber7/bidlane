import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: mocks.warn } }));

import { listingChannel, userChannel } from "./catalog";
import { notificationsChanged, publish } from "./server";
import { installFakeRealtime, type FakeRealtime } from "./testing";

let realtime: FakeRealtime;
beforeEach(() => { vi.clearAllMocks(); realtime = installFakeRealtime(); });
afterEach(() => realtime.uninstall());

const bid = { id: "bid-1", amount: 1200 } as never;

describe("publishing real-time updates", () => {
  it("sends every event to its channel", async () => {
    await publish("bid.realtime_update_failed", [
      { channel: listingChannel("listing-1"), event: "new-bid", payload: bid },
      { channel: listingChannel("listing-1"), event: "new-end-time", payload: { newEndTime: "2026-11-24T12:00:00.000Z" } },
      ...notificationsChanged(["buyer"]),
    ]);

    expect(realtime.published).toEqual([
      { channel: "listing:listing-1", event: "new-bid", payload: bid },
      { channel: "listing:listing-1", event: "new-end-time", payload: { newEndTime: "2026-11-24T12:00:00.000Z" } },
      { channel: "user:buyer", event: "notifications-changed", payload: {} },
    ]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("tells each affected user once that their notifications changed", async () => {
    await publish("notification.realtime_update_failed", notificationsChanged(["buyer", "seller", "buyer"]));

    expect(realtime.sent("user:buyer", "notifications-changed")).toEqual([{}]);
    expect(realtime.sent("user:seller", "notifications-changed")).toEqual([{}]);
  });

  it("logs one warning naming the failed events and never rejects", async () => {
    realtime.failSends((event) => event !== "new-bid");

    await expect(publish("bid.realtime_update_failed", [
      { channel: listingChannel("listing-1"), event: "new-bid", payload: bid },
      { channel: listingChannel("listing-1"), event: "new-end-time", payload: { newEndTime: "2026-11-24T12:00:00.000Z" } },
      ...notificationsChanged(["buyer"]),
    ], { listingId: "listing-1" })).resolves.toBeUndefined();

    expect(realtime.sent("listing:listing-1", "new-bid")).toEqual([bid]);
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith("bid.realtime_update_failed", {
      listingId: "listing-1",
      failed: [
        { channel: "listing", event: "new-end-time" },
        { channel: "user", event: "notifications-changed" },
      ],
    });
  });

  it("publishes nothing and logs nothing for an empty batch", async () => {
    await publish("notification.realtime_update_failed", notificationsChanged([]));
    expect(realtime.published).toEqual([]);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it("names a user channel the same way for publishing and authorization", () => {
    expect(userChannel("buyer").name).toBe("private-user-buyer");
    expect(listingChannel("listing-1").name).toBe("listing-listing-1");
  });
});
