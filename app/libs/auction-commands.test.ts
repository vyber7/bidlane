import { MongoServerError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";

// Data behaviour is tested against real MongoDB in
// prisma/native/auctions.integration.test.ts. These cover only the retry and
// contention policy, which needs failures a local replica set cannot force.
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("./native-repositories", () => ({ withNativeTransaction: mocks.transaction }));

import { installFakeRealtime, type FakeRealtime } from "./realtime/testing";
import { placeBid, startAuction } from "./auction-commands";

const duplicateKey = () => new MongoServerError({ message: "race", code: 11000 });
const unknownCommit = () => new MongoServerError({ message: "uncertain", code: 11000, errorLabels: ["UnknownTransactionCommitResult"] });
const bid = { bidder: { id: "bidder", emailVerified: new Date() }, listingId: "abcdef0123456789abcdef01", amount: 1000, key: "bid-request-00000001" };
const start = { sellerId: "seller", listingId: bid.listingId, startingBid: 1000, bidIncrement: 100, endsAt: new Date(Date.now() + 3600000) };

let realtime: FakeRealtime;
beforeEach(() => { vi.clearAllMocks(); realtime = installFakeRealtime(); });
afterEach(() => realtime.uninstall());

describe("auction command retry policy", () => {

  it("rereads a duplicate request key in a new transaction and replays the winner", async () => {
    const response = { bid: { id: "winning-bid" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockRejectedValueOnce(duplicateKey()).mockResolvedValueOnce({ ok: true, replayed: true, response });
    await expect(placeBid(bid)).resolves.toEqual({ ok: true, replayed: true, response });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(realtime.published).toEqual([]);
  });

  it("gives up as busy after three duplicate-key attempts", async () => {
    mocks.transaction.mockRejectedValue(duplicateKey());
    await expect(placeBid(bid)).resolves.toEqual({ ok: false, reason: "busy" });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("reports an exhausted contention budget as busy for every command", async () => {
    mocks.transaction.mockRejectedValue(new TransactionRetryLimitError());
    await expect(placeBid(bid)).resolves.toEqual({ ok: false, reason: "busy" });
    await expect(startAuction(start)).resolves.toEqual({ ok: false, reason: "busy" });
  });

  it("never reruns a transaction whose commit result is unknown", async () => {
    mocks.transaction.mockRejectedValue(unknownCommit());
    await expect(placeBid(bid)).rejects.toThrow("uncertain");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(realtime.published).toEqual([]);
  });

  it("publishes an accepted bid, its Extension and the outbid Notification together", async () => {
    const response = { bid: { id: "bid-1" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockResolvedValue({ ok: true, replayed: false, response, extended: true, notificationUsers: ["previous"] });
    await expect(placeBid(bid)).resolves.toEqual({ ok: true, replayed: false, response });
    expect(realtime.published).toEqual([
      { channel: `listing:${bid.listingId}`, event: "new-bid", payload: response.bid },
      { channel: `listing:${bid.listingId}`, event: "new-end-time", payload: { newEndTime: response.auctionEndsAt } },
      { channel: "user:previous", event: "notifications-changed", payload: {} },
    ]);
  });

  it("publishes no new end time for a bid outside the Extension window", async () => {
    const response = { bid: { id: "bid-1" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockResolvedValue({ ok: true, replayed: false, response, extended: false, notificationUsers: [] });
    await placeBid(bid);
    expect(realtime.published.map((item) => item.event)).toEqual(["new-bid"]);
  });

  it("returns a committed bid even if its real-time updates fail", async () => {
    const response = { bid: { id: "bid-1" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockResolvedValue({ ok: true, replayed: false, response, extended: true, notificationUsers: [] });
    realtime.failSends();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(placeBid(bid)).resolves.toEqual({ ok: true, replayed: false, response });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"bid.realtime_update_failed"'));
    warn.mockRestore();
  });

  it("publishes the Auction start with the Notifications it saved", async () => {
    const now = new Date(start.endsAt.getTime() - 60_000);
    mocks.transaction.mockResolvedValue({ ok: true, notificationUsers: ["watcher"] });
    await expect(startAuction(start, now)).resolves.toMatchObject({ ok: true });
    expect(realtime.published).toEqual([
      {
        channel: `listing:${start.listingId}`,
        event: "auction-started",
        payload: { auctionStartsAt: now.toISOString(), auctionEndsAt: start.endsAt.toISOString(), startingBid: 1000, bidIncrement: 100 },
      },
      { channel: "user:watcher", event: "notifications-changed", payload: {} },
    ]);
  });

  it("starts the Auction even if its real-time updates fail", async () => {
    mocks.transaction.mockResolvedValue({ ok: true, notificationUsers: ["watcher"] });
    realtime.failSends();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(startAuction(start)).resolves.toMatchObject({ ok: true });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"auction.start_realtime_update_failed"'));
    warn.mockRestore();
  });

  it("checks the start deadline and bid ladder before opening a transaction", async () => {
    await expect(startAuction({ ...start, endsAt: new Date(Date.now() - 1) })).resolves.toEqual({ ok: false, reason: "ends-in-past" });
    await expect(startAuction({ ...start, startingBid: 2_147_483_600 })).resolves.toEqual({ ok: false, reason: "ladder-too-large" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
