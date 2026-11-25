import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Document } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { isPublicListing, publicListingFilter } from "@/app/libs/listing-review";
import { auctionPhase } from "@/app/libs/auction-lifecycle";
import { makeListing } from "@/app/test/auction-fixtures";

const url = process.env.NATIVE_TEST_DATABASE_URL;
const now = Date.now();
const hour = 3_600_000;

// One stored shape per Auction phase, plus a legacy Listing with no stored
// status, which reads as Upcoming.
const phases = [
  { status: "UPCOMING", result: null, auctionStartsAt: null, auctionEndsAt: null },
  { status: "LIVE", result: null, auctionStartsAt: new Date(now - hour), auctionEndsAt: new Date(now + hour) },
  { status: "LIVE", result: null, auctionStartsAt: new Date(now - 2 * hour), auctionEndsAt: new Date(now - hour) },
  { status: "ENDED", result: "SOLD", auctionStartsAt: new Date(now - 2 * hour), auctionEndsAt: new Date(now - hour) },
  { status: "ENDED", result: "RESERVE_NOT_MET", auctionStartsAt: new Date(now - 2 * hour), auctionEndsAt: new Date(now - hour) },
  { status: undefined, result: null, auctionStartsAt: null, auctionEndsAt: null },
] as const;
// Every Review state, plus a legacy Listing submitted before Review existed.
const reviewStates = ["PENDING", "APPROVED", "CHANGES_REQUESTED", undefined] as const;

describe.skipIf(!url)("the Review module's visibility rule", () => {
  let connection: DatabaseV8;
  const documents: Document[] = [];

  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (
      parsed.hosts.length !== 1 ||
      !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) ||
      !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)
    )
      throw new Error("Visibility tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_visibility";
    connection = createDatabaseV8(parsed.toString());
    await connection.mongoClient.connect();
    await connection.database.dropDatabase();
    for (const phase of phases)
      for (const reviewStatus of reviewStates) {
        const document: Document = { _id: new ObjectId(), userId: new ObjectId(), ...phase, reviewStatus };
        for (const key of Object.keys(document)) if (document[key] === undefined) delete document[key];
        documents.push(document);
      }
    await connection.database.collection("Listing").insertMany(documents);
  }, 30_000);

  afterAll(async () => {
    if (!connection) return;
    await connection.database.dropDatabase();
    await connection.close();
  }, 30_000);

  const ids = (rows: { _id?: ObjectId; id?: string }[]) =>
    rows.map((row) => row.id ?? row._id!.toHexString()).sort();

  it("covers every Auction phase", () => {
    const covered = new Set(documents.map((document) =>
      auctionPhase(makeListing({ ...document, status: document.status ?? "UPCOMING" } as never), now).phase));
    expect([...covered].sort()).toEqual(["closing", "open", "sold", "unsold", "upcoming"]);
  });

  it("gives the same answer as a check, a native filter and a read filter", async () => {
    const checked = ids(documents.filter((document) =>
      isPublicListing({ status: document.status ?? null, reviewStatus: document.reviewStatus ?? null })));
    const native = ids(await connection.database.collection("Listing").find(publicListingFilter.native()).toArray());
    const read = ids(await connection.db.orm.Listing.where(publicListingFilter.read()).select("id").all());

    // Opened Auctions are public in every Review state; Upcoming ones only with Approval.
    expect(checked).toHaveLength(4 * reviewStates.length + 2);
    expect(native).toEqual(checked);
    expect(read).toEqual(checked);
  });
});
