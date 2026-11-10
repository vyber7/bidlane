import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Long, ObjectId } from "mongodb";
import { createDatabaseV8, type DatabaseV8 } from "./client";
import { createNativeRepositories } from "../native/repositories";
import { ensureNativeIndexes } from "../native/indexes.mjs";
import { auditDatabase, manageDatabase, nativeCollections, runPrisma } from "../../scripts/prisma-management.mjs";
import { fingerprint, rehearsalUrl, seedRehearsal } from "../../scripts/prisma-rehearsal.mjs";
import { parseListing } from "@/app/libs/listing-validation";

const suppliedUrl = process.env.MIGRATION_TEST_DATABASE_URL;
describe.skipIf(!suppliedUrl)("guarded v8 database-management rehearsal", () => {
  let connection: DatabaseV8, url: string;
  beforeAll(async () => {
    url = rehearsalUrl(suppliedUrl!); connection = createDatabaseV8(url); await connection.mongoClient.connect();
    expect(await connection.database.listCollections().toArray()).toEqual([]);
  }, 30_000);
  beforeEach(async () => { await connection.database.dropDatabase(); await seedRehearsal(connection.database); }, 30_000);
  afterAll(async () => { if (connection) { await connection.database.dropDatabase(); await connection.close(); } }, 30_000);

  it("audits representative data and plans no native collection/index drops", async () => {
    const before = await fingerprint(connection.database, [...nativeCollections, "OperationalNotes"]);
    const report = await manageDatabase("plan", connection.database, url);
    expect(report.ready).toBe(true); expect(report.blockedOperations).toEqual([]); expect(report.applied).toBe(false);
    expect(report.operations).toHaveLength(10); expect(report.operations.every((operation: { id: string }) => operation.id.startsWith("validator."))).toBe(true);
    expect(await fingerprint(connection.database, [...nativeCollections, "OperationalNotes"])).toEqual(before);
  }, 60_000);

  it("bootstraps a fresh database after the additive native-index initialization", async () => {
    await connection.database.dropDatabase(); await ensureNativeIndexes(connection.database);
    const report = await manageDatabase("apply", connection.database, url);
    expect(report.applied).toBe(true); expect(report.blockedOperations).toEqual([]);
    expect((await auditDatabase(connection.database)).ready).toBe(true);
  }, 60_000);

  it.each(["missing", "null", "type", "extra"])("blocks strict validator adoption for %s legacy incompatibility without changing data/schema", async (kind) => {
    const users = connection.database.collection("User");
    if (kind === "missing") await users.updateMany({}, { $unset: { watchListIds: "" } });
    if (kind === "null") await users.updateMany({}, { $set: { outbidEmailsEnabled: null } });
    if (kind === "type") await users.updateMany({}, { $set: { highestBidsIds: ["not-an-object-id"] } });
    if (kind === "extra") await users.updateMany({}, { $set: { legacyPrivateField: "DO_NOT_DISCLOSE" } });
    const before = await fingerprint(connection.database, ["User"]);
    const report = await manageDatabase("apply", connection.database, url);
    expect(report.ready).toBe(false); expect(report.applied).toBe(false);
    expect(report.audit.collections.find((entry: { collection: string }) => entry.collection === "User")?.invalidDocuments).toBe(1);
    expect(JSON.stringify(report)).not.toContain("DO_NOT_DISCLOSE");
    expect(await fingerprint(connection.database, ["User"])).toEqual(before);
    const info = await connection.database.listCollections({ name: "User" }).next();
    expect(info && "options" in info ? info.options?.validator : undefined).toBeUndefined();
  }, 60_000);

  it("blocks plans that would remove an existing managed-collection index", async () => {
    await connection.database.collection("Listing").createIndex({ make: 1 }, { name: "Unreviewed_legacy_index" });
    const report = await manageDatabase("apply", connection.database, url);
    expect(report.ready).toBe(false); expect(report.applied).toBe(false);
    expect(report.blockedOperations).toContainEqual(expect.objectContaining({ id: "index.Listing.drop(Unreviewed_legacy_index)" }));
    expect((await connection.database.collection("Listing").indexes()).some((index) => index.name === "Unreviewed_legacy_index")).toBe(true);
  }, 60_000);

  it("updates, signs and verifies without modifying documents or native indexes, then accepts application writes", async () => {
    const names = (await connection.database.listCollections().toArray()).map((entry) => entry.name);
    const before = await fingerprint(connection.database, names);
    const report = await manageDatabase("apply", connection.database, url);
    expect(report.applied).toBe(true); expect(await fingerprint(connection.database, names)).toEqual(before);
    const repeated = await manageDatabase("apply", connection.database, url);
    expect(repeated.operations).toEqual([]); expect(repeated.applied).toBe(true);
    await expect(connection.database.collection("User").insertOne({ _id: new ObjectId() })).rejects.toMatchObject({ code: 121 });
    const repositories = createNativeRepositories(connection.database);
    const owner = await repositories.users.create({ email: "new-owner@example.test", name: "Owner", emailVerified: null });
    const image = "https://res.cloudinary.com/demo/image/upload/fixture.jpg";
    const listing = await repositories.listingAuthoring.create(owner.id, parseListing({ year: 2020, make: "Porsche", model: "911", miles: 100, location: "Miami", description: "Fixture", reservePrice: null, transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "Known", modifications: "None", knownFlaws: "None", images: [image] }), new Date());
    await connection.withTransaction(async (database, session) => {
      const tx = createNativeRepositories(database, session), now = new Date();
      await tx.listingAuthoring.setReview(listing.id, { revision: 0, decision: "APPROVED", reason: "" }, now);
      const current = (await tx.auctions.find(listing.id))!;
      expect((await tx.auctions.start(current, { auctionStartsAt: now, auctionEndsAt: new Date(now.getTime() + 3600_000), startingBid: 1000, bidIncrement: 100 })).count).toBe(1);
      const comment = await tx.comments.create({ listingId: listing.id, userId: owner.id, body: "Fixture" }, now);
      await tx.engagement.touchComment(listing.id, now);
      await tx.notifications.insertOnce({ userId: owner.id, eventKey: `comment:${comment.id}`, kind: "comment", title: "Fixture", message: "Fixture", href: `/listing/${listing.id}`, actionLabel: "Open", tone: "neutral", createdAt: now });
    });
    await repositories.quotas.abuse.consume("new:string-id", new Date());
    expect((await connection.database.collection<{ _id: string; count: number }>("AbuseQuota").findOne({ _id: "new:string-id" }))?.count).toEqual(1);
    expect((await auditDatabase(connection.database)).ready).toBe(true);
    await runPrisma(["db", "verify"], url);
    expect((await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false }))?.year).toEqual(Long.fromNumber(2020));
  }, 60_000);
});
