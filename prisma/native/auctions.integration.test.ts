import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import {
  createNativeRepositories,
  type NativeRepositories,
} from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";
import { auctionTransactionOptions } from "./transaction-errors";
import { makeListing } from "@/app/test/auction-fixtures";

const state = vi.hoisted(() => ({
  connection: undefined as DatabaseV8 | undefined,
  trigger: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/app/libs/prismadb-v8", () => ({
  getDatabaseV8: () => {
    if (!state.connection)
      throw new Error("Local auction database is not initialized");
    return state.connection;
  },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { error: state.log, warn: state.log },
}));

import {
  placeBid,
  startAuction,
  type BidOutcome,
} from "@/app/libs/auction-commands";
import { POST as retryFinalization } from "@/app/api/auction-finalize/route";
import {
  finalizeAuction,
  finalizeExpiredAuctions,
} from "@/app/libs/auction-finalization";
import { queueEndingSoonReminders } from "@/app/libs/ending-soon-reminders";
import { withNativeTransaction } from "@/app/libs/native-repositories";
import {
  outbidNotifications,
  saveNotifications,
} from "@/app/libs/notifications";
import { installServerTransport } from "@/app/libs/realtime/server";

// Real-time updates reach the spy through the event channel's transport,
// with the same wire arguments Pusher receives.
installServerTransport({
  send: (channel, event, payload) => state.trigger(channel.name, event, payload),
  authorize: () => ({}),
});

const request = (body: unknown, key = "bid-request-00000001") =>
  new Request("http://localhost/api/auction", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": key },
  });
const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "native auction transactions on a local MongoDB replica set",
  () => {
    let connection: DatabaseV8;
    let repositories: NativeRepositories;
    let seller: AuthUser, buyer: AuthUser, other: AuthUser;

    beforeAll(async () => {
      const parsed = new ConnectionString(url!);
      if (
        parsed.hosts.length !== 1 ||
        !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) ||
        !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)
      )
        throw new Error(
          "Auction integration tests require a loopback bidlane_test_native_ database",
        );
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
    }, 30_000);
    beforeEach(async () => {
      vi.clearAllMocks();
      for (const collection of await connection.database
        .listCollections()
        .toArray())
        await connection.database.collection(collection.name).deleteMany({});
      vi.stubEnv("NEXTAUTH_SECRET", "local-auction-transaction-test-secret");
      state.trigger.mockResolvedValue(undefined);
      seller = await repositories.users.create({
        name: "Seller",
        email: "seller@example.com",
        emailVerified: new Date(),
      });
      buyer = await repositories.users.create({
        name: "Buyer",
        email: "buyer@example.com",
        emailVerified: new Date(),
      });
      other = await repositories.users.create({
        name: "Other",
        email: "other@example.com",
        emailVerified: new Date(),
      });
    });
    afterEach(() => vi.unstubAllEnvs());
    afterAll(async () => {
      if (connection) {
        await connection.database.dropDatabase();
        await connection.close();
        state.connection = undefined;
      }
    }, 30_000);

    async function seed(overrides: Parameters<typeof makeListing>[0] = {}) {
      const now = new Date();
      const listing = makeListing({
        id: new ObjectId().toHexString(),
        userId: seller.id,
        startingBid: 1000,
        bidIncrement: 100,
        reservePrice: 1000,
        auctionStartsAt: new Date(now.getTime() - 3600000),
        auctionEndsAt: new Date(now.getTime() + 3600000),
        ...overrides,
      });
      const { id, ...fields } = listing;
      await connection.database.collection("Listing").insertOne({
        ...fields,
        _id: new ObjectId(id),
        userId: new ObjectId(listing.userId),
        year: Long.fromNumber(listing.year),
        miles: Long.fromNumber(listing.miles),
        views: Long.fromNumber(listing.views),
        reviewRevision:
          listing.reviewRevision == null
            ? null
            : Long.fromNumber(listing.reviewRevision),
        startingBid:
          listing.startingBid == null
            ? null
            : Long.fromNumber(listing.startingBid),
        currentBid:
          listing.currentBid == null
            ? null
            : Long.fromNumber(listing.currentBid),
        bidIncrement:
          listing.bidIncrement == null
            ? null
            : Long.fromNumber(listing.bidIncrement),
        reservePrice:
          listing.reservePrice == null
            ? null
            : Long.fromNumber(listing.reservePrice),
        highestBidderId: listing.highestBidderId
          ? new ObjectId(listing.highestBidderId)
          : null,
        biddersIds: listing.biddersIds.map((id) => new ObjectId(id)),
        watchersIds: listing.watchersIds.map((id) => new ObjectId(id)),
        seenIds: [],
        commentsIds: [],
        commenterIds: [],
      });
      return listing;
    }
    function bid(
      user: AuthUser,
      listingId: string,
      amount = 1000,
      key = "bid-request-00000001",
    ) {
      return placeBid({ bidder: user, listingId, amount, key });
    }
    function accepted(outcome: BidOutcome) {
      if (!outcome.ok) throw new Error(`Bid rejected: ${outcome.reason}`);
      return outcome.response;
    }
    function start(listingId: string) {
      return startAuction({
        sellerId: seller.id,
        listingId,
        startingBid: 1000,
        bidIncrement: 100,
        endsAt: new Date(Date.now() + 3600000),
      });
    }
    async function rejectWrites(
      collection: string,
      operation: () => Promise<void>,
    ) {
      await connection.database.command({
        collMod: collection,
        validator: { $expr: { $eq: [1, 0] } },
        validationLevel: "strict",
        validationAction: "error",
      });
      try {
        await operation();
      } finally {
        await connection.database.command({
          collMod: collection,
          validator: {},
        });
      }
    }

    it("commits the bid, both relation arrays, response snapshot and email notification with legacy BSON types", async () => {
      const listing = await seed({
        currentBid: 900,
        highestBidderId: other.id,
        biddersIds: [other.id],
      });
      state.trigger.mockImplementation(
        async (_channel: string, event: string, payload: { id?: string }) => {
          if (event === "new-bid")
            expect(
              await connection.database
                .collection("Bid")
                .findOne({ _id: new ObjectId(payload.id) }),
            ).not.toBeNull();
        },
      );
      const body = accepted(await bid(buyer, listing.id));
      expect(Object.keys(body.bid).sort()).toEqual([
        "amount",
        "createdAt",
        "id",
        "listingId",
        "user",
        "userId",
      ]);
      expect(body.bid.user).toEqual({ name: "Buyer" });
      const raw = await connection.database
        .collection("Listing")
        .findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
      expect(Long.isLong(raw?.currentBid)).toBe(true);
      expect(raw?.currentBid.toNumber()).toBe(1000);
      expect(raw?.highestBidderId).toEqual(new ObjectId(buyer.id));
      expect(raw?.biddersIds).toEqual([
        new ObjectId(other.id),
        new ObjectId(buyer.id),
      ]);
      expect(raw?.updatedAt).toEqual(new Date(body.bid.createdAt));
      expect(
        await connection.database
          .collection("User")
          .findOne({ _id: new ObjectId(buyer.id) }, { promoteLongs: false }),
      ).toMatchObject({ BidOnListIds: [new ObjectId(listing.id)] });
      expect(
        await connection.database
          .collection("Bid")
          .findOne({ _id: new ObjectId(body.bid.id) }, { promoteLongs: false }),
      ).toMatchObject({
        amount: Long.fromNumber(1000),
        listingId: new ObjectId(listing.id),
        userId: new ObjectId(buyer.id),
      });
      expect(
        await connection.database
          .collection("BidSubmission")
          .findOne(
            { userId: new ObjectId(buyer.id), key: "bid-request-00000001" },
            { promoteLongs: false },
          ),
      ).toMatchObject({ amount: Long.fromNumber(1000), response: body });
      const notification = await connection.database
        .collection("Notification")
        .findOne(
          { userId: new ObjectId(other.id), eventKey: `outbid:${body.bid.id}` },
          { promoteLongs: false },
        );
      expect(notification).toMatchObject({
        readAt: null,
        emailListingId: new ObjectId(listing.id),
        emailStatus: "PENDING",
        emailAttempts: Long.ZERO,
        emailLockedUntil: null,
        emailPayload: null,
      });
      expect(notification?.emailNextAttemptAt).toBeInstanceOf(Date);
    });

    it.each(["null", "missing"])(
      "accepts a first bid with a %s current price and extends a last-minute deadline",
      async (kind) => {
        const listing = await seed({
          auctionEndsAt: new Date(Date.now() + 30000),
        });
        if (kind === "missing")
          await connection.database
            .collection("Listing")
            .updateOne(
              { _id: new ObjectId(listing.id) },
              { $unset: { currentBid: "" } },
            );
        const body = accepted(await bid(buyer, listing.id));
        expect(
          new Date(body.auctionEndsAt).getTime() -
            new Date(body.bid.createdAt).getTime(),
        ).toBe(120000);
        expect(state.trigger).toHaveBeenCalledWith(
          `listing-${listing.id}`,
          "new-end-time",
          { newEndTime: body.auctionEndsAt },
        );
      },
    );

    it("accepts one concurrent same-key request and replays its exact result without repeat events", async () => {
      const listing = await seed({
        currentBid: 900,
        highestBidderId: other.id,
      });
      const outcomes = await Promise.all([
        bid(buyer, listing.id),
        bid(buyer, listing.id),
      ]);
      expect(outcomes.map((item) => item.ok && item.replayed).sort()).toEqual([
        false,
        true,
      ]);
      const bodies = outcomes.map(accepted);
      expect(bodies[0]).toEqual(bodies[1]);
      // A request is admitted at most once, however many times its
      // transaction retries before it reads the committed winner.
      const buckets = await connection.database
        .collection("AbuseQuota")
        .find({})
        .toArray();
      expect(buckets).toHaveLength(2);
      expect(buckets.every((item) => item.count <= 2)).toBe(true);
      expect(await connection.database.collection("Bid").countDocuments()).toBe(
        1,
      );
      expect(
        await connection.database.collection("BidSubmission").countDocuments(),
      ).toBe(1);
      expect(
        await connection.database.collection("Notification").countDocuments(),
      ).toBe(1);
      expect(
        state.trigger.mock.calls.filter(([, event]) => event === "new-bid"),
      ).toHaveLength(1);
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $set: { status: "ENDED" } },
        );
      const broadcasts = state.trigger.mock.calls.length;
      const replay = await bid({ ...buyer, emailVerified: null }, listing.id);
      expect(replay).toEqual({ ok: true, replayed: true, response: bodies[0] });
      expect(state.trigger).toHaveBeenCalledTimes(broadcasts);
      expect(await bid(buyer, listing.id, 1100)).toEqual({
        ok: false,
        reason: "key-reused",
      });
    });

    it("permits only one of two equal competing bids and retains the correct leader and arrays", async () => {
      const listing = await seed();
      const outcomes = await Promise.all([
        bid(buyer, listing.id),
        bid(other, listing.id),
      ]);
      const winners = outcomes.filter((item) => item.ok).map(accepted);
      expect(winners).toHaveLength(1);
      expect(
        outcomes.filter(
          (item) =>
            !item.ok &&
            ["below-minimum", "outpaced", "busy"].includes(item.reason),
        ),
      ).toHaveLength(1);
      const [winner] = winners;
      const current = await connection.database
        .collection("Listing")
        .findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
      expect(current).toMatchObject({
        currentBid: Long.fromNumber(1000),
        highestBidderId: new ObjectId(winner.bid.userId),
        biddersIds: [new ObjectId(winner.bid.userId)],
      });
      expect(await connection.database.collection("Bid").countDocuments()).toBe(
        1,
      );
      expect(
        await connection.database.collection("BidSubmission").countDocuments(),
      ).toBe(1);
    });

    it("keeps higher bids ordered under contention and never loses the final highest bid", async () => {
      const listing = await seed();
      const outcomes = await Promise.all([
        bid(buyer, listing.id, 1000),
        bid(other, listing.id, 1100),
      ]);
      const winners = outcomes.filter((item) => item.ok);
      expect(winners.length).toBeGreaterThan(0);
      expect(
        await connection.database
          .collection("Listing")
          .findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false }),
      ).toMatchObject({
        currentBid: Long.fromNumber(1100),
        highestBidderId: new ObjectId(other.id),
      });
      expect(await connection.database.collection("Bid").countDocuments()).toBe(
        winners.length,
      );
      expect(
        await connection.database.collection("BidSubmission").countDocuments(),
      ).toBe(winners.length);
    });

    it.each([
      ["the bidder's own listing", () => ({ userId: buyer.id }), { reason: "own-listing" }],
      ["an upcoming auction", () => ({ status: "UPCOMING" as const }), { reason: "not-open" }],
      ["an auction that has not started", () => ({ auctionStartsAt: new Date(Date.now() + 60000) }), { reason: "not-open" }],
      ["an auction past its deadline", () => ({ auctionEndsAt: new Date(Date.now() - 1000) }), { reason: "not-open" }],
      ["an unconfigured auction", () => ({ bidIncrement: null }), { reason: "unconfigured" }],
      ["a bid under the next increment", () => ({ currentBid: 1500, highestBidderId: other.id }), { reason: "below-minimum", minimumBid: 1600 }],
    ] as const)(
      "rejects a bid on %s without writing or reserving its key",
      async (_scenario, overrides, rejection) => {
        const listing = await seed(overrides());
        expect(await bid(buyer, listing.id, 1000)).toEqual({ ok: false, ...rejection });
        for (const name of ["Bid", "BidSubmission", "Notification"])
          expect(await connection.database.collection(name).countDocuments()).toBe(0);
        expect(state.trigger).not.toHaveBeenCalled();
        if (rejection.reason === "below-minimum")
          expect((await bid(buyer, listing.id, 1600)).ok).toBe(true);
      },
    );

    it("rejects an unverified bidder before charging the bid quota", async () => {
      const listing = await seed();
      expect(await bid({ ...buyer, emailVerified: null }, listing.id)).toEqual({
        ok: false,
        reason: "unverified",
      });
      expect(
        await connection.database.collection("AbuseQuota").countDocuments(),
      ).toBe(0);
    });

    it("loses the optimistic claim to a bid committed after the auction was read", async () => {
      const listing = await seed();
      const stale = (await repositories.auctions.find(listing.id))!;
      expect((await bid(other, listing.id, 1000)).ok).toBe(true);
      const bidTime = new Date();
      expect(
        await withNativeTransaction(
          (tx) =>
            tx.auctions.claimBid(
              stale,
              { amount: 1000, userId: buyer.id, auctionEndsAt: stale.auctionEndsAt! },
              bidTime,
            ),
          auctionTransactionOptions,
        ),
      ).toEqual({ count: 0 });
      expect(
        await connection.database
          .collection("Listing")
          .findOne({ _id: new ObjectId(listing.id) }),
      ).toMatchObject({ highestBidderId: new ObjectId(other.id) });
    });

    it.each(["Notification", "BidSubmission"])(
      "rolls back every bid effect when the %s write fails",
      async (collection) => {
        const listing = await seed({
          currentBid: 900,
          highestBidderId: other.id,
        });
        await rejectWrites(collection, async () => {
          await expect(bid(buyer, listing.id)).rejects.toMatchObject({
            code: 121,
          });
          expect(
            await connection.database
              .collection("Listing")
              .findOne(
                { _id: new ObjectId(listing.id) },
                { promoteLongs: false },
              ),
          ).toMatchObject({
            currentBid: Long.fromNumber(900),
            highestBidderId: new ObjectId(other.id),
            biddersIds: [],
            updatedAt: listing.updatedAt,
          });
          expect(
            await connection.database
              .collection("User")
              .findOne(
                { _id: new ObjectId(buyer.id) },
                { promoteLongs: false },
              ),
          ).toMatchObject({ BidOnListIds: [] });
          for (const name of ["Bid", "BidSubmission", "Notification"])
            expect(
              await connection.database.collection(name).countDocuments(),
            ).toBe(0);
          expect(state.trigger).not.toHaveBeenCalled();
          // Quota attempts deliberately survive a rejected transaction.
          const buckets = await connection.database
            .collection("AbuseQuota")
            .find({})
            .toArray();
          expect(buckets).toHaveLength(2);
          expect(buckets.every((item) => item.count === 1)).toBe(true);
        });
        expect((await bid(buyer, listing.id)).ok).toBe(true);
      },
    );

    it("replays a historical BSON request snapshot without touching a closed auction", async () => {
      const listing = await seed({ status: "ENDED" });
      const response = {
        bid: {
          id: new ObjectId().toHexString(),
          amount: 1000,
          listingId: listing.id,
          userId: buyer.id,
          user: { name: "Historical name" },
          createdAt: new Date().toISOString(),
        },
        currentBid: 1000,
        auctionEndsAt: listing.auctionEndsAt!.toISOString(),
      };
      await connection.database
        .collection("BidSubmission")
        .insertOne({
          _id: new ObjectId(),
          userId: new ObjectId(buyer.id),
          key: "bid-request-00000001",
          listingId: new ObjectId(listing.id),
          amount: Long.fromNumber(1000),
          response,
          createdAt: new Date(),
        });
      expect(await bid(buyer, listing.id)).toEqual({
        ok: true,
        replayed: true,
        response,
      });
      expect(await connection.database.collection("Bid").countDocuments()).toBe(
        0,
      );
      expect(
        await connection.database.collection("AbuseQuota").countDocuments(),
      ).toBe(0);
      expect(state.trigger).not.toHaveBeenCalled();
    });

    it.each(["missing", "null", "zero"])(
      "starts an approved legacy revision with a %s revision field",
      async (kind) => {
        const listing = await seed({
          status: "UPCOMING",
          reviewStatus: "APPROVED",
          reviewRevision: kind === "null" ? null : 0,
          watchersIds: [buyer.id, buyer.id, seller.id],
        });
        if (kind === "missing")
          await connection.database
            .collection("Listing")
            .updateOne(
              { _id: new ObjectId(listing.id) },
              { $unset: { reviewRevision: "" } },
            );
        expect((await start(listing.id)).ok).toBe(true);
        const raw = await connection.database
          .collection("Listing")
          .findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
        expect(raw?.status).toBe("LIVE");
        expect(Long.isLong(raw?.startingBid)).toBe(true);
        expect(Long.isLong(raw?.bidIncrement)).toBe(true);
        expect(
          await connection.database
            .collection("Notification")
            .countDocuments({}),
        ).toBe(1);
        expect(
          (
            await connection.database
              .collection("Notification")
              .findOne({}, { promoteLongs: false })
          )?.userId,
        ).toEqual(new ObjectId(buyer.id));
      },
    );

    it("allows one concurrent start and rolls back a start whose notification fails", async () => {
      const listing = await seed({
        status: "UPCOMING",
        reviewStatus: "APPROVED",
        watchersIds: [buyer.id],
      });
      await rejectWrites("Notification", async () => {
        await expect(start(listing.id)).rejects.toMatchObject({ code: 121 });
        expect((await repositories.auctions.find(listing.id))?.status).toBe(
          "UPCOMING",
        );
        expect(state.trigger).not.toHaveBeenCalled();
      });
      const responses = await Promise.all([
        start(listing.id),
        start(listing.id),
      ]);
      // The loser is refused at the claim, or on reread if the driver retried
      // its transaction after the winner committed. Both map to 409.
      const [loser, winner] = responses
        .map((item) => (item.ok ? "started" : item.reason))
        .sort();
      expect(winner).toBe("started");
      expect(["already-started", "not-upcoming"]).toContain(loser);
      expect(
        await connection.database.collection("Notification").countDocuments({}),
      ).toBe(1);
      expect(
        state.trigger.mock.calls.filter(
          ([, event]) => event === "auction-started",
        ),
      ).toHaveLength(1);
    });

    it("lets only the seller start an auction, and only with a future deadline", async () => {
      const listing = await seed({ status: "UPCOMING", reviewStatus: "APPROVED" });
      const request = {
        listingId: listing.id,
        startingBid: 1000,
        bidIncrement: 100,
        endsAt: new Date(Date.now() + 3600000),
      };
      expect(await startAuction({ ...request, sellerId: buyer.id })).toEqual({
        ok: false,
        reason: "not-seller",
      });
      expect(
        await startAuction({ ...request, sellerId: seller.id, endsAt: new Date(Date.now() - 1) }),
      ).toEqual({ ok: false, reason: "ends-in-past" });
      expect((await repositories.auctions.find(listing.id))?.status).toBe("UPCOMING");
      expect(state.trigger).not.toHaveBeenCalled();
    });

    it("rejects an unapproved listing and a stale approval revision at the native claim", async () => {
      const listing = await seed({
        status: "UPCOMING",
        reviewStatus: "PENDING",
      });
      expect(await start(listing.id)).toEqual({
        ok: false,
        reason: "not-approved",
      });
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $set: { reviewStatus: "APPROVED", reviewRevision: Long.ONE } },
        );
      const stale = (await repositories.auctions.find(listing.id))!;
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $set: { reviewRevision: Long.fromNumber(2) } },
        );
      expect(
        await withNativeTransaction(
          (tx) =>
            tx.auctions.start(stale, {
              auctionStartsAt: new Date(),
              auctionEndsAt: listing.auctionEndsAt!,
              startingBid: 1000,
              bidIncrement: 100,
            }),
          auctionTransactionOptions,
        ),
      ).toEqual({ count: 0 });
      expect(state.trigger).not.toHaveBeenCalled();
    });

    it("finalizes once under concurrent callers and saves seller/winner notifications together", async () => {
      const listing = await seed({
        auctionEndsAt: new Date(Date.now() - 1000),
        currentBid: 1200,
        highestBidderId: buyer.id,
        biddersIds: [buyer.id, buyer.id],
      });
      const now = new Date();
      const results = await Promise.all([
        finalizeAuction(listing.id, now),
        finalizeAuction(listing.id, now),
      ]);
      expect(results.map((item) => item.status).sort()).toEqual([
        "already_finalized",
        "finalized",
      ]);
      expect(
        await connection.database
          .collection("Listing")
          .findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false }),
      ).toMatchObject({
        status: "ENDED",
        result: "SOLD",
        auctionEndsAt: listing.auctionEndsAt,
      });
      expect(
        await connection.database.collection("Notification").countDocuments({}),
      ).toBe(2);
      expect(
        state.trigger.mock.calls.filter(
          ([, event]) => event === "auction-ended",
        ),
      ).toHaveLength(1);
      expect(
        (await retryFinalization(request({ listingId: listing.id }))).status,
      ).toBe(200);
      expect(
        await connection.database.collection("Notification").countDocuments({}),
      ).toBe(2);
    });

    it("rolls back finalization on a notification failure and retries on the next run", async () => {
      const listing = await seed({
        auctionEndsAt: new Date(Date.now() - 1000),
      });
      await rejectWrites("Notification", async () => {
        await expect(finalizeAuction(listing.id)).rejects.toMatchObject({
          code: 121,
        });
        expect(
          await connection.database
            .collection("Listing")
            .findOne(
              { _id: new ObjectId(listing.id) },
              { promoteLongs: false },
            ),
        ).toMatchObject({
          status: "LIVE",
          result: null,
          updatedAt: listing.updatedAt,
        });
        expect(state.trigger).not.toHaveBeenCalled();
      });
      expect(await finalizeAuction(listing.id)).toMatchObject({
        status: "finalized",
        result: "RESERVE_NOT_MET",
      });
    });

    it("rejects malformed legacy dates before changing auction state", async () => {
      const listing = await seed();
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $set: { auctionEndsAt: "2020-01-01" } },
        );
      await expect(finalizeAuction(listing.id)).rejects.toThrow(
        "Invalid auction date",
      );
      const raw = await connection.database
        .collection("Listing")
        .findOne({ _id: new ObjectId(listing.id) });
      expect(raw?.status).toBe("LIVE");
      expect(
        await connection.database.collection("Notification").countDocuments({}),
      ).toBe(0);
      expect(state.trigger).not.toHaveBeenCalled();
    });

    it("rejects stale finalization after a last-minute extension or price change", async () => {
      const listing = await seed({
        auctionEndsAt: new Date(Date.now() + 30000),
      });
      const stale = (await repositories.auctions.find(listing.id))!;
      expect((await bid(buyer, listing.id)).ok).toBe(true);
      expect(
        await withNativeTransaction(
          (tx) => tx.auctions.finish(stale, "RESERVE_NOT_MET", new Date()),
          auctionTransactionOptions,
        ),
      ).toEqual({ count: 0 });
      expect(
        await finalizeAuction(
          listing.id,
          new Date(listing.auctionEndsAt!.getTime() + 1),
        ),
      ).toMatchObject({ status: "not_due" });
      const current = (await repositories.auctions.find(listing.id))!;
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $set: { currentBid: Long.fromNumber(1100) } },
        );
      expect(
        await withNativeTransaction(
          (tx) => tx.auctions.finish(current, "SOLD", new Date()),
          auctionTransactionOptions,
        ),
      ).toEqual({ count: 0 });
    });

    it("bounds scheduled finalization batches and excludes future and upcoming auctions", async () => {
      await seed({ auctionEndsAt: new Date(Date.now() - 2000) });
      await seed({ auctionEndsAt: new Date(Date.now() - 1000) });
      await seed();
      await seed({
        status: "UPCOMING",
        auctionEndsAt: new Date(Date.now() - 1000),
      });
      expect(await finalizeExpiredAuctions(new Date(), 1)).toEqual({
        checked: 1,
        finalized: 1,
        skipped: 0,
        failed: 0,
        hasMore: true,
      });
      expect(await finalizeExpiredAuctions(new Date(), 100)).toEqual({
        checked: 1,
        finalized: 1,
        skipped: 0,
        failed: 0,
        hasMore: false,
      });
      expect(
        await connection.database
          .collection("Listing")
          .countDocuments({ status: "LIVE" }),
      ).toBe(1);
    });

    it("claims ending-soon reminders once across workers, including a legacy missing marker", async () => {
      const now = new Date();
      const listing = await seed({
        auctionEndsAt: new Date(now.getTime() + 1800000),
        watchersIds: [buyer.id, buyer.id, seller.id],
        biddersIds: [other.id],
        highestBidderId: other.id,
      });
      await connection.database
        .collection("Listing")
        .updateOne(
          { _id: new ObjectId(listing.id) },
          { $unset: { endingSoonReminderAt: "" } },
        );
      await seed({ auctionEndsAt: new Date(now.getTime() + 7200000) });
      await seed({ auctionEndsAt: new Date(now.getTime() - 1000) });
      await seed({
        status: "UPCOMING",
        auctionEndsAt: new Date(now.getTime() + 10000),
      });
      const results = await Promise.all([
        queueEndingSoonReminders(now),
        queueEndingSoonReminders(now),
      ]);
      expect(results.reduce((sum, item) => sum + item.queued, 0)).toBe(1);
      const alerts = await connection.database
        .collection("Notification")
        .find({}, { promoteLongs: false })
        .toArray();
      expect(alerts.map((item) => item.userId.toHexString()).sort()).toEqual(
        [buyer.id, other.id].sort(),
      );
      expect(
        alerts.every(
          (item) =>
            item.eventKey === `ending-soon:${listing.id}` &&
            item.emailStatus === "PENDING",
        ),
      ).toBe(true);
      expect(await queueEndingSoonReminders(now)).toMatchObject({ queued: 0 });
    });

    it("rolls back the reminder marker when persistence fails", async () => {
      const now = new Date();
      const listing = await seed({
        auctionEndsAt: new Date(now.getTime() + 10000),
        watchersIds: [buyer.id],
      });
      await rejectWrites("Notification", async () => {
        expect(await queueEndingSoonReminders(now)).toMatchObject({
          failed: 1,
          queued: 0,
        });
        expect(
          (
            await connection.database
              .collection("Listing")
              .findOne(
                { _id: new ObjectId(listing.id) },
                { promoteLongs: false },
              )
          )?.endingSoonReminderAt,
        ).toBeNull();
        expect(state.trigger).not.toHaveBeenCalled();
      });
      expect(await queueEndingSoonReminders(now)).toMatchObject({ queued: 1 });
    });

    it("preserves notification read state and completed email delivery on event replay", async () => {
      const listing = await seed({ highestBidderId: other.id });
      const event = outbidNotifications(listing, {
        id: new ObjectId().toHexString(),
        userId: buyer.id,
        createdAt: new Date(),
      });
      await withNativeTransaction(
        (tx) => saveNotifications(tx, event),
        auctionTransactionOptions,
      );
      const readAt = new Date();
      await connection.database
        .collection("Notification")
        .updateOne(
          { userId: new ObjectId(other.id) },
          {
            $set: {
              readAt,
              emailStatus: "SENT",
              emailAttempts: Long.fromNumber(2),
              emailProviderId: "sent-once",
            },
          },
        );
      await withNativeTransaction(
        (tx) => saveNotifications(tx, event),
        auctionTransactionOptions,
      );
      expect(
        await connection.database
          .collection("Notification")
          .findOne({}, { promoteLongs: false }),
      ).toMatchObject({
        readAt,
        emailStatus: "SENT",
        emailAttempts: Long.fromNumber(2),
        emailProviderId: "sent-once",
      });
      expect(
        await connection.database.collection("Notification").countDocuments({}),
      ).toBe(1);
    });
  },
);
