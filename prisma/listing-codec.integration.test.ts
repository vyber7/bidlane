import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Long, ObjectId, type Document } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { createDatabaseV8, type DatabaseV8 } from "./v8/client";
import { createNativeRepositories } from "./native/repositories";
import { createReadRepositories } from "./reads/repositories";

const url = process.env.NATIVE_TEST_DATABASE_URL;
const now = Date.now();
const hour = 3_600_000;
const watcher = new ObjectId();
const base = () => ({
  _id: new ObjectId(),
  userId: new ObjectId(),
  make: "Mazda",
  model: "Miata",
  location: "Portland, OR",
  description: "Original paint.",
  createdAt: new Date(now - 48 * hour),
  reviewStatus: "APPROVED",
});

// Historical stored shapes, and what every repository must read them as.
const fixtures = [
  {
    name: "a Listing stored before status, Review revisions, view counts and featuring",
    document: { ...base(), year: 1999, miles: 120000 },
    expected: { status: "UPCOMING", reviewRevision: 0, views: 1, isFeatured: false, year: 1999, currentBid: null, watcherCount: 0, auctionEndsAt: null },
  },
  {
    name: "a live Listing stored with 64-bit numbers by an earlier driver",
    document: {
      ...base(),
      year: Long.fromNumber(2004),
      miles: Long.fromNumber(64000),
      status: "LIVE",
      views: Long.fromNumber(7),
      reviewRevision: Long.fromNumber(2),
      isFeatured: true,
      startingBid: Long.fromNumber(15000),
      currentBid: Long.fromNumber(21000),
      bidIncrement: Long.fromNumber(250),
      auctionStartsAt: new Date(now - hour),
      auctionEndsAt: new Date(now + hour),
      watchersIds: [watcher],
    },
    expected: { status: "LIVE", reviewRevision: 2, views: 7, isFeatured: true, year: 2004, currentBid: 21000, watcherCount: 1, auctionEndsAt: new Date(now + hour) },
  },
  {
    name: "a sold Listing stored with every field",
    document: {
      ...base(),
      year: 2015,
      miles: 30000,
      status: "ENDED",
      result: "SOLD",
      views: 30,
      reviewRevision: 5,
      isFeatured: false,
      images: [],
      startingBid: 20000,
      currentBid: 31000,
      bidIncrement: 500,
      auctionStartsAt: new Date(now - 26 * hour),
      auctionEndsAt: new Date(now - 2 * hour),
      watchersIds: [watcher],
      biddersIds: [],
      seenIds: [],
      commentsIds: [],
      commenterIds: [],
    },
    expected: { status: "ENDED", reviewRevision: 5, views: 30, isFeatured: false, year: 2015, currentBid: 31000, watcherCount: 1, auctionEndsAt: new Date(now - 2 * hour) },
  },
] as const;

describe.skipIf(!url)("every repository reads a stored Listing the same way", () => {
  let connection: DatabaseV8;

  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (
      parsed.hosts.length !== 1 ||
      !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) ||
      !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)
    )
      throw new Error("Listing codec tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_listing_codec";
    connection = createDatabaseV8(parsed.toString());
    await connection.mongoClient.connect();
    await connection.database.dropDatabase();
    await connection.database.collection<Document>("Listing").insertMany(fixtures.map((fixture) => fixture.document));
  }, 30_000);

  afterAll(async () => {
    if (!connection) return;
    await connection.database.dropDatabase();
    await connection.close();
  }, 30_000);

  // Each read, flattened to the Listing fields it exposes.
  const reads = (id: string, sellerId: string) => {
    const native = createNativeRepositories(connection.database);
    const read = createReadRepositories(connection);
    const watchers = <Watched extends { watchersIds: readonly string[] }>(listing: Watched | null) =>
      listing && { ...listing, watcherCount: listing.watchersIds.length };
    return {
      "auctions.find": async () => watchers(await native.auctions.find(id)),
      "engagement.find": () => native.engagement.find(id),
      "engagement.watchSnapshot": async () => (await native.engagement.watchSnapshot(id, watcher.toHexString()))?.listing,
      "notificationEmails.listing": async () => watchers(await native.notificationEmails.listing(id)),
      "listingAuthoring.find": () => native.listingAuthoring.find(id),
      "reads.listings.find": async () => watchers(await read.listings.find(id)),
      "reads.sellers.active or sales": async () =>
        [...(await read.sellers.active(sellerId)), ...(await read.sellers.sales(sellerId, 1))][0],
    };
  };

  const readers = [
    "auctions.find",
    "engagement.find",
    "engagement.watchSnapshot",
    "notificationEmails.listing",
    "listingAuthoring.find",
    "reads.listings.find",
    "reads.sellers.active or sales",
  ] as const satisfies readonly (keyof ReturnType<typeof reads>)[];

  describe.each(fixtures)("$name", ({ document, expected }) => {
    it.each(readers)("reads the same through %s", async (name) => {
      const read = reads(document._id.toHexString(), document.userId.toHexString())[name];
      const listing = (await read()) as Record<string, unknown> | null | undefined;
      expect(listing).toBeTruthy();
      const exposed = Object.fromEntries(Object.entries(expected).filter(([field]) => field in listing!));
      expect(Object.keys(exposed).length).toBeGreaterThan(1);
      expect(Object.fromEntries(Object.keys(exposed).map((field) => [field, listing![field]]))).toEqual(exposed);
    });
  });
});
