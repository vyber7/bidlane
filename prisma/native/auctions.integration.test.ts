import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { PrismaClient } from "@prisma/client";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";
import { auctionTransactionOptions } from "./transaction-errors";
import { makeListing } from "@/app/test/auction-fixtures";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, currentUser: vi.fn(), trigger: vi.fn(), log: vi.fn() }));
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local auction database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/libs/prismadb", () => ({ default: new Proxy({}, { get() { throw new Error("Auction lifecycle must not use Prisma 6"); } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: state.currentUser }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: state.trigger } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: state.log, warn: state.log } }));

import { POST as placeBid } from "@/app/api/place-bid/route";
import { POST as startAuction } from "@/app/api/auction-start/route";
import { POST as endAuction } from "@/app/api/auction-end/route";
import { finalizeAuction, finalizeExpiredAuctions } from "@/app/libs/auction-finalization";
import { queueEndingSoonReminders } from "@/app/libs/ending-soon-reminders";
import { withNativeTransaction } from "@/app/libs/native-repositories";
import { outbidNotifications, saveNotifications } from "@/app/libs/notifications";

const request = (body: unknown, key = "bid-request-00000001") => new Request("http://localhost/api/auction", { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key } });
const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("native auction transactions on a local MongoDB replica set", () => {
  let connection: DatabaseV8;
  let repositories: NativeRepositories;
  let legacy: PrismaClient;
  let seller: AuthUser, buyer: AuthUser, other: AuthUser;

  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Auction integration tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_auctions";
    const localUrl = parsed.toString();
    connection = createDatabaseV8(localUrl);
    state.connection = connection;
    await connection.mongoClient.connect();
    // The guarded local database is disposable, including stale indexes or
    // validators left by a previously interrupted integration run.
    await connection.database.dropDatabase();
    await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database);
    legacy = new PrismaClient({ datasourceUrl: localUrl });
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks();
    for (const collection of await connection.database.listCollections().toArray()) await connection.database.collection(collection.name).deleteMany({});
    vi.stubEnv("NEXTAUTH_SECRET", "local-auction-transaction-test-secret");
    state.trigger.mockResolvedValue(undefined);
    seller = await repositories.users.create({ name: "Seller", email: "seller@example.com", emailVerified: new Date() });
    buyer = await repositories.users.create({ name: "Buyer", email: "buyer@example.com", emailVerified: new Date() });
    other = await repositories.users.create({ name: "Other", email: "other@example.com", emailVerified: new Date() });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (connection) { await legacy?.$disconnect(); await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);

  async function seed(overrides: Parameters<typeof makeListing>[0] = {}) {
    const now = new Date();
    const listing = makeListing({ id: new ObjectId().toHexString(), userId: seller.id, startingBid: 1000, bidIncrement: 100, reservePrice: 1000, auctionStartsAt: new Date(now.getTime() - 3600000), auctionEndsAt: new Date(now.getTime() + 3600000), ...overrides });
    const { id, ...fields } = listing;
    await connection.database.collection("Listing").insertOne({
      ...fields, _id: new ObjectId(id), userId: new ObjectId(listing.userId),
      year: Long.fromNumber(listing.year), miles: Long.fromNumber(listing.miles), views: Long.fromNumber(listing.views),
      reviewRevision: listing.reviewRevision == null ? null : Long.fromNumber(listing.reviewRevision),
      startingBid: listing.startingBid == null ? null : Long.fromNumber(listing.startingBid),
      currentBid: listing.currentBid == null ? null : Long.fromNumber(listing.currentBid),
      bidIncrement: listing.bidIncrement == null ? null : Long.fromNumber(listing.bidIncrement),
      reservePrice: listing.reservePrice == null ? null : Long.fromNumber(listing.reservePrice),
      highestBidderId: listing.highestBidderId ? new ObjectId(listing.highestBidderId) : null,
      biddersIds: listing.biddersIds.map((id) => new ObjectId(id)), watchersIds: listing.watchersIds.map((id) => new ObjectId(id)),
      seenIds: [], commentsIds: [], commenterIds: [],
    });
    return listing;
  }
  function bid(user: AuthUser, listingId: string, amount = 1000, key = "bid-request-00000001") {
    // Each invocation captures its own actor before its first await, including
    // concurrent requests from different users.
    state.currentUser.mockResolvedValueOnce(user);
    return placeBid(request({ listingId, bidAmount: amount }, key));
  }
  function start(listingId: string) {
    state.currentUser.mockResolvedValueOnce(seller);
    return startAuction(request({ listingId, startingBid: 1000, bidIncrement: 100, endTime: new Date(Date.now() + 3600000).toISOString() }));
  }
  async function rejectWrites(collection: string, operation: () => Promise<void>) {
    await connection.database.command({ collMod: collection, validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { await operation(); }
    finally { await connection.database.command({ collMod: collection, validator: {} }); }
  }

  it("commits the bid, both relation arrays, response snapshot and email notification with legacy BSON types", async () => {
    const listing = await seed({ currentBid: 900, highestBidderId: other.id, biddersIds: [other.id] });
    state.trigger.mockImplementation(async (_channel: string, event: string, payload: { id?: string }) => {
      if (event === "new-bid") expect(await connection.database.collection("Bid").findOne({ _id: new ObjectId(payload.id) })).not.toBeNull();
    });
    const response = await bid(buyer, listing.id);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Object.keys(body.bid).sort()).toEqual(["amount", "createdAt", "id", "listingId", "user", "userId"]);
    expect(body.bid.user).toEqual({ name: "Buyer" });
    const raw = await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
    expect(Long.isLong(raw?.currentBid)).toBe(true);
    expect(raw?.currentBid.toNumber()).toBe(1000);
    expect(raw?.highestBidderId).toEqual(new ObjectId(buyer.id));
    expect(raw?.biddersIds).toEqual([new ObjectId(other.id), new ObjectId(buyer.id)]);
    expect(raw?.updatedAt).toEqual(new Date(body.bid.createdAt));
    expect(await legacy.user.findUnique({ where: { id: buyer.id } })).toMatchObject({ BidOnListIds: [listing.id] });
    expect(await legacy.bid.findUnique({ where: { id: body.bid.id } })).toMatchObject({ amount: 1000, listingId: listing.id, userId: buyer.id });
    expect(await legacy.bidSubmission.findUnique({ where: { userId_key: { userId: buyer.id, key: "bid-request-00000001" } } })).toMatchObject({ amount: 1000, response: body });
    const notification = await legacy.notification.findUnique({ where: { userId_eventKey: { userId: other.id, eventKey: `outbid:${body.bid.id}` } } });
    expect(notification).toMatchObject({ readAt: null, emailListingId: listing.id, emailStatus: "PENDING", emailAttempts: 0, emailLockedUntil: null, emailPayload: null });
    expect(notification?.emailNextAttemptAt).toBeInstanceOf(Date);
  });

  it.each(["null", "missing"])("accepts a first bid with a %s current price and extends a last-minute deadline", async (kind) => {
    const listing = await seed({ auctionEndsAt: new Date(Date.now() + 30000) });
    if (kind === "missing") await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $unset: { currentBid: "" } });
    const response = await bid(buyer, listing.id);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(new Date(body.auctionEndsAt).getTime() - new Date(body.bid.createdAt).getTime()).toBe(120000);
    expect(state.trigger).toHaveBeenCalledWith(`listing-${listing.id}`, "new-end-time", { newEndTime: body.auctionEndsAt });
  });

  it("accepts one concurrent same-key request and replays its exact result without repeat events", async () => {
    const listing = await seed({ currentBid: 900, highestBidderId: other.id });
    const responses = await Promise.all([bid(buyer, listing.id), bid(buyer, listing.id)]);
    expect(responses.map((item) => item.status)).toEqual([201, 201]);
    const bodies = await Promise.all(responses.map((item) => item.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(await connection.database.collection("Bid").countDocuments()).toBe(1);
    expect(await connection.database.collection("BidSubmission").countDocuments()).toBe(1);
    expect(await connection.database.collection("Notification").countDocuments()).toBe(1);
    expect(state.trigger.mock.calls.filter(([, event]) => event === "new-bid")).toHaveLength(1);
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $set: { status: "ENDED" } });
    const broadcasts = state.trigger.mock.calls.length;
    const replay = await bid({ ...buyer, emailVerified: null }, listing.id);
    expect(replay.status).toBe(201); expect(await replay.json()).toEqual(bodies[0]);
    expect(state.trigger).toHaveBeenCalledTimes(broadcasts);
    expect((await bid(buyer, listing.id, 1100)).status).toBe(409);
  });

  it("permits only one of two equal competing bids and retains the correct leader and arrays", async () => {
    const listing = await seed();
    const responses = await Promise.all([bid(buyer, listing.id), bid(other, listing.id)]);
    expect(responses.filter((item) => item.status === 201)).toHaveLength(1);
    expect(responses.filter((item) => [400, 409, 503].includes(item.status))).toHaveLength(1);
    const accepted = await responses.find((item) => item.status === 201)!.json();
    const current = await legacy.listing.findUnique({ where: { id: listing.id } });
    expect(current).toMatchObject({ currentBid: 1000, highestBidderId: accepted.bid.userId, biddersIds: [accepted.bid.userId] });
    expect(await connection.database.collection("Bid").countDocuments()).toBe(1);
    expect(await connection.database.collection("BidSubmission").countDocuments()).toBe(1);
  });

  it("keeps higher bids ordered under contention and never loses the final highest bid", async () => {
    const listing = await seed();
    const responses = await Promise.all([bid(buyer, listing.id, 1000), bid(other, listing.id, 1100)]);
    const accepted = await Promise.all(responses.filter((item) => item.status === 201).map((item) => item.json()));
    expect(accepted.length).toBeGreaterThan(0);
    expect(await legacy.listing.findUnique({ where: { id: listing.id } })).toMatchObject({ currentBid: 1100, highestBidderId: other.id });
    expect(await connection.database.collection("Bid").countDocuments()).toBe(accepted.length);
    expect(await connection.database.collection("BidSubmission").countDocuments()).toBe(accepted.length);
  });

  it.each(["Notification", "BidSubmission"])("rolls back every bid effect when the %s write fails", async (collection) => {
    const listing = await seed({ currentBid: 900, highestBidderId: other.id });
    await rejectWrites(collection, async () => {
      expect((await bid(buyer, listing.id)).status).toBe(500);
      expect(await legacy.listing.findUnique({ where: { id: listing.id } })).toMatchObject({ currentBid: 900, highestBidderId: other.id, biddersIds: [], updatedAt: listing.updatedAt });
      expect(await legacy.user.findUnique({ where: { id: buyer.id } })).toMatchObject({ BidOnListIds: [] });
      for (const name of ["Bid", "BidSubmission", "Notification"]) expect(await connection.database.collection(name).countDocuments()).toBe(0);
      expect(state.trigger).not.toHaveBeenCalled();
      // Quota attempts deliberately survive a rejected transaction.
      const buckets = await connection.database.collection("AbuseQuota").find({}).toArray();
      expect(buckets).toHaveLength(2);
      expect(buckets.every((item) => item.count === 1)).toBe(true);
    });
    expect((await bid(buyer, listing.id)).status).toBe(201);
  });

  it("reads successful request snapshots written by Prisma 6 without touching a closed auction", async () => {
    const listing = await seed({ status: "ENDED" });
    const response = { bid: { id: new ObjectId().toHexString(), amount: 1000, listingId: listing.id, userId: buyer.id, user: { name: "Historical name" }, createdAt: new Date().toISOString() }, currentBid: 1000, auctionEndsAt: listing.auctionEndsAt!.toISOString() };
    await legacy.bidSubmission.create({ data: { userId: buyer.id, key: "bid-request-00000001", listingId: listing.id, amount: 1000, response } });
    const replay = await bid(buyer, listing.id);
    expect(replay.status).toBe(201); expect(await replay.json()).toEqual(response);
    expect(await connection.database.collection("Bid").countDocuments()).toBe(0);
    expect(await connection.database.collection("AbuseQuota").countDocuments()).toBe(0);
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it.each(["missing", "null", "zero"])("starts an approved legacy revision with a %s revision field", async (kind) => {
    const listing = await seed({ status: "UPCOMING", reviewStatus: "APPROVED", reviewRevision: kind === "null" ? null : 0, watchersIds: [buyer.id, buyer.id, seller.id] });
    if (kind === "missing") await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $unset: { reviewRevision: "" } });
    expect((await start(listing.id)).status).toBe(201);
    const raw = await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
    expect(raw?.status).toBe("LIVE"); expect(Long.isLong(raw?.startingBid)).toBe(true); expect(Long.isLong(raw?.bidIncrement)).toBe(true);
    expect(await legacy.notification.count()).toBe(1);
    expect((await legacy.notification.findFirst())?.userId).toBe(buyer.id);
  });

  it("allows one concurrent start and rolls back a start whose notification fails", async () => {
    const listing = await seed({ status: "UPCOMING", reviewStatus: "APPROVED", watchersIds: [buyer.id] });
    await rejectWrites("Notification", async () => {
      expect((await start(listing.id)).status).toBe(500);
      expect((await repositories.auctions.find(listing.id))?.status).toBe("UPCOMING");
      expect(state.trigger).not.toHaveBeenCalled();
    });
    const responses = await Promise.all([start(listing.id), start(listing.id)]);
    expect(responses.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(await legacy.notification.count()).toBe(1);
    expect(state.trigger.mock.calls.filter(([, event]) => event === "auction-started")).toHaveLength(1);
  });

  it("rejects an unapproved listing and a stale approval revision at the native claim", async () => {
    const listing = await seed({ status: "UPCOMING", reviewStatus: "PENDING" });
    expect((await start(listing.id)).status).toBe(409);
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $set: { reviewStatus: "APPROVED", reviewRevision: Long.ONE } });
    const stale = (await repositories.auctions.find(listing.id))!;
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $set: { reviewRevision: Long.fromNumber(2) } });
    expect(await withNativeTransaction((tx) => tx.auctions.start(stale, { auctionStartsAt: new Date(), auctionEndsAt: listing.auctionEndsAt!, startingBid: 1000, bidIncrement: 100 }), auctionTransactionOptions)).toEqual({ count: 0 });
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it("finalizes once under concurrent callers and saves seller/winner notifications together", async () => {
    const listing = await seed({ auctionEndsAt: new Date(Date.now() - 1000), currentBid: 1200, highestBidderId: buyer.id, biddersIds: [buyer.id, buyer.id] });
    const now = new Date();
    const results = await Promise.all([finalizeAuction(listing.id, now), finalizeAuction(listing.id, now)]);
    expect(results.map((item) => item.status).sort()).toEqual(["already_finalized", "finalized"]);
    expect(await legacy.listing.findUnique({ where: { id: listing.id } })).toMatchObject({ status: "ENDED", result: "SOLD", auctionEndsAt: listing.auctionEndsAt });
    expect(await legacy.notification.count()).toBe(2);
    expect(state.trigger.mock.calls.filter(([, event]) => event === "auction-ended")).toHaveLength(1);
    state.currentUser.mockResolvedValueOnce(seller);
    expect((await endAuction(request({ listingId: listing.id }))).status).toBe(200);
    expect(await legacy.notification.count()).toBe(2);
  });

  it("rolls back finalization on a notification failure and retries on the next run", async () => {
    const listing = await seed({ auctionEndsAt: new Date(Date.now() - 1000) });
    await rejectWrites("Notification", async () => {
      await expect(finalizeAuction(listing.id)).rejects.toMatchObject({ code: 121 });
      expect(await legacy.listing.findUnique({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", result: null, updatedAt: listing.updatedAt });
      expect(state.trigger).not.toHaveBeenCalled();
    });
    expect(await finalizeAuction(listing.id)).toMatchObject({ status: "finalized", result: "RESERVE_NOT_MET" });
  });

  it("rejects malformed legacy dates before changing auction state", async () => {
    const listing = await seed();
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $set: { auctionEndsAt: "2020-01-01" } });
    await expect(finalizeAuction(listing.id)).rejects.toThrow("Invalid auction date");
    const raw = await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) });
    expect(raw?.status).toBe("LIVE");
    expect(await legacy.notification.count()).toBe(0);
    expect(state.trigger).not.toHaveBeenCalled();
  });

  it("rejects stale finalization after a last-minute extension or price change", async () => {
    const listing = await seed({ auctionEndsAt: new Date(Date.now() + 30000) });
    const stale = (await repositories.auctions.find(listing.id))!;
    expect((await bid(buyer, listing.id)).status).toBe(201);
    expect(await withNativeTransaction((tx) => tx.auctions.finish(stale, "RESERVE_NOT_MET", new Date()), auctionTransactionOptions)).toEqual({ count: 0 });
    expect(await finalizeAuction(listing.id, new Date(listing.auctionEndsAt!.getTime() + 1))).toMatchObject({ status: "not_due" });
    const current = (await repositories.auctions.find(listing.id))!;
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $set: { currentBid: Long.fromNumber(1100) } });
    expect(await withNativeTransaction((tx) => tx.auctions.finish(current, "SOLD", new Date()), auctionTransactionOptions)).toEqual({ count: 0 });
  });

  it("bounds scheduled finalization batches and excludes future and upcoming auctions", async () => {
    await seed({ auctionEndsAt: new Date(Date.now() - 2000) });
    await seed({ auctionEndsAt: new Date(Date.now() - 1000) });
    await seed(); await seed({ status: "UPCOMING", auctionEndsAt: new Date(Date.now() - 1000) });
    expect(await finalizeExpiredAuctions(new Date(), 1)).toEqual({ checked: 1, finalized: 1, skipped: 0, failed: 0, hasMore: true });
    expect(await finalizeExpiredAuctions(new Date(), 100)).toEqual({ checked: 1, finalized: 1, skipped: 0, failed: 0, hasMore: false });
    expect(await legacy.listing.count({ where: { status: "LIVE" } })).toBe(1);
  });

  it("claims ending-soon reminders once across workers, including a legacy missing marker", async () => {
    const now = new Date();
    const listing = await seed({ auctionEndsAt: new Date(now.getTime() + 1800000), watchersIds: [buyer.id, buyer.id, seller.id], biddersIds: [other.id], highestBidderId: other.id });
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, { $unset: { endingSoonReminderAt: "" } });
    await seed({ auctionEndsAt: new Date(now.getTime() + 7200000) });
    await seed({ auctionEndsAt: new Date(now.getTime() - 1000) });
    await seed({ status: "UPCOMING", auctionEndsAt: new Date(now.getTime() + 10000) });
    const results = await Promise.all([queueEndingSoonReminders(now), queueEndingSoonReminders(now)]);
    expect(results.reduce((sum, item) => sum + item.queued, 0)).toBe(1);
    const alerts = await legacy.notification.findMany();
    expect(alerts.map((item) => item.userId).sort()).toEqual([buyer.id, other.id].sort());
    expect(alerts.every((item) => item.eventKey === `ending-soon:${listing.id}` && item.emailStatus === "PENDING")).toBe(true);
    expect(await queueEndingSoonReminders(now)).toMatchObject({ queued: 0 });
  });

  it("rolls back the reminder marker when persistence fails", async () => {
    const now = new Date();
    const listing = await seed({ auctionEndsAt: new Date(now.getTime() + 10000), watchersIds: [buyer.id] });
    await rejectWrites("Notification", async () => {
      expect(await queueEndingSoonReminders(now)).toMatchObject({ failed: 1, queued: 0 });
      expect((await legacy.listing.findUnique({ where: { id: listing.id } }))?.endingSoonReminderAt).toBeNull();
      expect(state.trigger).not.toHaveBeenCalled();
    });
    expect(await queueEndingSoonReminders(now)).toMatchObject({ queued: 1 });
  });

  it("preserves notification read state and completed email delivery on event replay", async () => {
    const listing = await seed({ highestBidderId: other.id });
    const event = outbidNotifications(listing, { id: new ObjectId().toHexString(), userId: buyer.id, createdAt: new Date() });
    await withNativeTransaction((tx) => saveNotifications(tx, event), auctionTransactionOptions);
    const readAt = new Date();
    await connection.database.collection("Notification").updateOne({ userId: new ObjectId(other.id) }, { $set: { readAt, emailStatus: "SENT", emailAttempts: Long.fromNumber(2), emailProviderId: "sent-once" } });
    await withNativeTransaction((tx) => saveNotifications(tx, event), auctionTransactionOptions);
    expect(await legacy.notification.findFirst()).toMatchObject({ readAt, emailStatus: "SENT", emailAttempts: 2, emailProviderId: "sent-once" });
    expect(await legacy.notification.count()).toBe(1);
  });
});
