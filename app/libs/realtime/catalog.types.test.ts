import { expect, it } from "vitest";
import { listingChannel, userChannel, type RealtimeEvent } from "./catalog";
import type { useRealtimeEvent } from "./client";
import type { BidEvent } from "@/app/types/auction-events";

// These assertions are compile-time: `tsc --noEmit` fails if a mismatch below
// stops being an error. The runtime test only keeps vitest from reporting an
// empty file.

const bid = { id: "bid-1" } as BidEvent;

export const accepted: RealtimeEvent[] = [
  { channel: listingChannel("l"), event: "new-bid", payload: bid },
  { channel: userChannel("u"), event: "notifications-changed", payload: {} },
];

// @ts-expect-error A user's channel doesn't carry Listing events.
export const wrongChannel: RealtimeEvent = {
  channel: userChannel("u"),
  event: "new-bid",
  payload: bid,
};

export const wrongPayload: RealtimeEvent = {
  channel: listingChannel("l"),
  event: "new-end-time",
  // @ts-expect-error The new end time carries `newEndTime`.
  payload: { auctionEndsAt: "2026-11-24T00:00:00.000Z" },
};

export const unknownEvent: RealtimeEvent = {
  channel: listingChannel("l"),
  // @ts-expect-error Events must come from the catalog.
  event: "bid-placed",
  payload: bid,
};

type Subscribe = typeof useRealtimeEvent;
export const subscribeChecks = (subscribe: Subscribe) => {
  subscribe(listingChannel("l"), "new-end-time", ({ newEndTime }) => newEndTime.length);
  // @ts-expect-error A Listing's channel doesn't carry user events.
  subscribe(listingChannel("l"), "notifications-changed", () => {});
  // @ts-expect-error The handler receives the event's own payload.
  subscribe(listingChannel("l"), "new-end-time", ({ auctionEndsAt }: { auctionEndsAt: string }) => auctionEndsAt);
};

it("type-checks the event catalog", () => {
  expect(accepted).toHaveLength(2);
});
