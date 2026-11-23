import { MongoServerError } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";

// Data behaviour is tested against real MongoDB in
// prisma/native/auctions.integration.test.ts. These cover only the retry and
// contention policy, which needs failures a local replica set cannot force.
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), trigger: vi.fn() }));
vi.mock("./native-repositories", () => ({ withNativeTransaction: mocks.transaction }));
vi.mock("./pusher", () => ({ pusherServer: { trigger: mocks.trigger } }));

import { placeBid, startAuction } from "./auction-commands";

const duplicateKey = () => new MongoServerError({ message: "race", code: 11000 });
const unknownCommit = () => new MongoServerError({ message: "uncertain", code: 11000, errorLabels: ["UnknownTransactionCommitResult"] });
const bid = { bidder: { id: "bidder", emailVerified: new Date() }, listingId: "abcdef0123456789abcdef01", amount: 1000, key: "bid-request-00000001" };
const start = { sellerId: "seller", listingId: bid.listingId, startingBid: 1000, bidIncrement: 100, endsAt: new Date(Date.now() + 3600000) };

describe("auction command retry policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rereads a duplicate request key in a new transaction and replays the winner", async () => {
    const response = { bid: { id: "winning-bid" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockRejectedValueOnce(duplicateKey()).mockResolvedValueOnce({ ok: true, replayed: true, response });
    await expect(placeBid(bid)).resolves.toEqual({ ok: true, replayed: true, response });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.trigger).not.toHaveBeenCalled();
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
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it("returns a committed bid even if publishing fails", async () => {
    const response = { bid: { id: "bid-1" }, currentBid: 1000, auctionEndsAt: new Date().toISOString() };
    mocks.transaction.mockResolvedValue({ ok: true, replayed: false, response, extended: true, notificationUsers: [] });
    mocks.trigger.mockRejectedValue(new Error("Pusher unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(placeBid(bid)).resolves.toEqual({ ok: true, replayed: false, response });
    expect(mocks.trigger).toHaveBeenCalledWith(`listing-${bid.listingId}`, "new-end-time", { newEndTime: response.auctionEndsAt });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"bid.notification_failed"'));
    warn.mockRestore();
  });

  it("checks the start deadline and bid ladder before opening a transaction", async () => {
    await expect(startAuction({ ...start, endsAt: new Date(Date.now() - 1) })).resolves.toEqual({ ok: false, reason: "ends-in-past" });
    await expect(startAuction({ ...start, startingBid: 2_147_483_600 })).resolves.toEqual({ ok: false, reason: "ladder-too-large" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
