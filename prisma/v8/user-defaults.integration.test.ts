import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Document } from "mongodb";
import { createDatabaseV8, type DatabaseV8 } from "./client";
import {
  rehearsalUrl,
  seedRehearsal,
} from "../../scripts/prisma-rehearsal.mjs";
import {
  applyUserDefaults,
  planUserDefaults,
  userDefaults,
} from "../../scripts/backfill-user-defaults.mjs";
import { auditDatabase } from "../../scripts/prisma-management.mjs";

const url = process.env.MIGRATION_TEST_DATABASE_URL;
describe.skipIf(!url)(
  "missing user-default backfill on a disposable replica set",
  () => {
    let connection: DatabaseV8;
    let rows: Record<string, Document>;
    beforeAll(async () => {
      connection = createDatabaseV8(rehearsalUrl(url!));
      await connection.mongoClient.connect();
      expect(await connection.database.listCollections().toArray()).toEqual([]);
      rows = (await seedRehearsal(connection.database)) as Record<
        string,
        Document
      >;
    }, 60_000);
    beforeEach(async () => {
      // Keep indexes between cases: rebuilding the whole inventory competes
      // with the adoption suite's DDL without exercising the backfill itself.
      await connection.database.collection("User").deleteMany({});
      await connection.database
        .collection("Listing")
        .replaceOne({ _id: rows.Listing._id }, rows.Listing);
      const users = Array.from({ length: 11 }, (_, index) => {
        const row: Document = {
          ...rows.User,
          _id: new ObjectId(),
          email: `fixture-${index}@example.test`,
          hashedPassword: "fixture-credential",
          sessionVersion: "fixture-session",
          role: "ADMIN",
          endingSoonEmailsEnabled: false,
          watchListIds: [rows.Listing._id],
          BidOnListIds: [rows.Listing._id],
        };
        for (const field of [
          "highestBidsIds",
          "listingsCommentedOnIds",
          "seenListIds",
        ])
          delete row[field];
        if (index < 6) delete row.BidOnListIds;
        if (index < 7) delete row.watchListIds;
        if (index < 10) delete row.endingSoonEmailsEnabled;
        return row;
      });
      await connection.database.collection("User").insertMany(users);
    }, 30_000);
    afterAll(async () => {
      if (connection) {
        await connection.database.dropDatabase();
        await connection.close();
      }
    }, 30_000);
    const users = () => connection.database.collection("User");
    const snapshot = () => users().find({}).sort({ _id: 1 }).toArray();

    it("previews the observed missing-field pattern without changing data or disclosing values", async () => {
      const before = await snapshot();
      const plan = await planUserDefaults(connection.database);
      expect(plan).toMatchObject({
        ready: true,
        mode: "preview",
        total: 11,
        documentsToChange: 11,
        fieldsToAdd: 56,
        invalidBefore: 11,
        invalidAfter: 0,
      });
      expect(
        plan.changes.map((change) => [change.field, change.documents]),
      ).toEqual([
        ["BidOnListIds", 6],
        ["highestBidsIds", 11],
        ["listingsCommentedOnIds", 11],
        ["seenListIds", 11],
        ["watchListIds", 7],
        ["endingSoonEmailsEnabled", 10],
      ]);
      expect(await snapshot()).toEqual(before);
      expect(JSON.stringify(plan)).not.toContain("fixture-credential");
      expect(JSON.stringify(plan)).not.toContain("example.test");
    });

    it("fills only missing fields atomically, preserving arrays, opt-outs, credentials, roles, proof and timestamps", async () => {
      const before = await snapshot();
      expect(
        await applyUserDefaults(connection.database, connection.mongoClient),
      ).toMatchObject({
        ready: true,
        mode: "applied",
        modifiedDocuments: 11,
        fieldsToAdd: 56,
      });
      const after = await snapshot();
      for (let index = 0; index < before.length; index++) {
        const expected = { ...before[index] };
        for (const [field, value] of Object.entries(userDefaults))
          if (!Object.hasOwn(expected, field)) expected[field] = value;
        expect(after[index]).toEqual(expected);
      }
      expect((await auditDatabase(connection.database)).ready).toBe(true);
      expect(
        await applyUserDefaults(connection.database, connection.mongoClient),
      ).toMatchObject({
        mode: "applied",
        modifiedDocuments: 0,
        fieldsToAdd: 0,
      });
    });

    it.each(["null", "wrong-type", "extra-field", "other-collection"])(
      "refuses unresolved %s problems without partially filling missing values",
      async (kind) => {
        const user = (await snapshot())[0];
        if (kind === "null")
          await users().updateOne(
            { _id: user._id },
            { $set: { watchListIds: null } },
          );
        if (kind === "wrong-type")
          await users().updateOne(
            { _id: user._id },
            { $set: { watchListIds: ["invalid"] } },
          );
        if (kind === "extra-field")
          await users().updateOne(
            { _id: user._id },
            { $set: { unexpected: "private" } },
          );
        if (kind === "other-collection")
          await connection.database
            .collection("Listing")
            .updateMany({}, { $unset: { year: "" } });
        const before = await snapshot();
        expect(
          await applyUserDefaults(connection.database, connection.mongoClient),
        ).toMatchObject({
          ready: false,
          mode: "blocked",
          modifiedDocuments: 0,
        });
        expect(await snapshot()).toEqual(before);
      },
    );

    it("rolls back all additions when persistence fails", async () => {
      const before = await snapshot();
      const rejected = await users().findOne({}, { sort: { $natural: -1 } });
      await connection.database.command({
        collMod: "User",
        validator: { _id: { $ne: rejected!._id } },
        validationLevel: "strict",
        validationAction: "error",
      });
      try {
        await expect(
          applyUserDefaults(connection.database, connection.mongoClient),
        ).rejects.toMatchObject({ code: 121 });
      } finally {
        await connection.database.command({ collMod: "User", validator: {} });
      }
      expect(await snapshot()).toEqual(before);
    });

    it("preserves concurrent watchlist additions and explicit email opt-outs", async () => {
      const user = (await snapshot()).find(
        (row) => !Object.hasOwn(row, "watchListIds"),
      )!;
      const listingId = new ObjectId();
      await Promise.all([
        applyUserDefaults(connection.database, connection.mongoClient),
        users().updateOne(
          { _id: user._id },
          {
            $set: { endingSoonEmailsEnabled: false },
            $addToSet: { watchListIds: listingId },
          },
        ),
      ]);
      expect(await users().findOne({ _id: user._id })).toMatchObject({
        endingSoonEmailsEnabled: false,
        watchListIds: [listingId],
      });
      expect((await auditDatabase(connection.database)).ready).toBe(true);
    });
  },
);
