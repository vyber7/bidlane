import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { completionRepository } from "./completion";
import { transactionCompletion } from "@/app/libs/transaction-completion";

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("shared completion persistence on local MongoDB", () => {
  let client: MongoClient, database: Db, repository: ReturnType<typeof completionRepository>;
  const seller = new ObjectId(), buyer = new ObjectId(), stranger = new ObjectId();
  const inserted: ObjectId[] = [];
  const now = new Date("2026-11-14T12:00:00Z");

  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) {
      throw new Error("Completion tests require a loopback bidlane_test_native_ database");
    }
    parsed.pathname += "_completion";
    client = new MongoClient(parsed.toString(), { directConnection: true, serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    database = client.db();
    repository = completionRepository(database);
  });
  afterEach(async () => {
    if (database && inserted.length) await database.collection("Listing").deleteMany({ _id: { $in: inserted.splice(0) } });
  });
  afterAll(async () => { await client?.close(); });
  async function listing(overrides: Record<string, unknown> = {}) {
    const _id = new ObjectId();
    inserted.push(_id);
    await database.collection("Listing").insertOne({ _id, userId: seller, highestBidderId: buyer, status: "ENDED", result: "SOLD", updatedAt: now, ...overrides });
    return _id.toHexString();
  }

  it("starts historical sales empty and exposes the same state to only the buyer and seller", async () => {
    const id = await listing();
    expect(await repository.find(id, buyer.toHexString())).toEqual({ role: "buyer", completion: transactionCompletion({}) });
    expect(await repository.find(id, seller.toHexString())).toEqual({ role: "seller", completion: transactionCompletion({}) });
    expect(await repository.find(id, stranger.toHexString())).toBeNull();
    expect(await repository.confirm(id, stranger.toHexString(), "payment", true, now)).toBeNull();
    expect(await repository.find(new ObjectId().toHexString(), buyer.toHexString())).toBeNull();
  });

  it.each([
    { status: "LIVE" }, { status: "UPCOMING" }, { result: "RESERVE_NOT_MET" },
    { highestBidderId: null }, { highestBidderId: seller },
  ])("rejects an ineligible auction: %j", async (overrides) => {
    const id = await listing(overrides);
    expect(await repository.find(id, seller.toHexString())).toBeNull();
    expect(await repository.confirm(id, seller.toHexString(), "payment", true, now)).toBeNull();
  });

  it("preserves simultaneous confirmations, retries, and the other party's confirmation when reopened", async () => {
    const id = await listing();
    await Promise.all((["payment", "paperwork", "pickup"] as const).flatMap((step) =>
      [buyer, seller].map((user) => repository.confirm(id, user.toHexString(), step, true, now)),
    ));
    const complete = transactionCompletion({
      paymentBuyerConfirmedAt: now, paymentSellerConfirmedAt: now,
      paperworkBuyerConfirmedAt: now, paperworkSellerConfirmedAt: now,
      pickupBuyerConfirmedAt: now, pickupSellerConfirmedAt: now,
    });
    expect((await repository.find(id, buyer.toHexString()))?.completion).toEqual(complete);
    await repository.confirm(id, buyer.toHexString(), "payment", true, new Date(now.getTime() + 60_000));
    expect((await repository.find(id, seller.toHexString()))?.completion).toEqual(complete);
    await repository.confirm(id, buyer.toHexString(), "pickup", false, now);
    complete.pickup.buyer = null;
    expect((await repository.find(id, seller.toHexString()))?.completion).toEqual(complete);
    expect((await database.collection("Listing").findOne({ _id: new ObjectId(id) }))?.updatedAt).toEqual(now);
  });
});
