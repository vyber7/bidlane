import { afterEach, describe, expect, it } from "vitest";
import { MongoServerError, type ClientSession } from "mongodb";
import { TransactionRetryLimitError } from "../native/transaction-errors";
import { createDatabaseV8, type DatabaseV8 } from "./client";

let connection: DatabaseV8 | undefined;
afterEach(async () => {
  await connection?.close();
  connection = undefined;
});

describe("Prisma 8 connection lifecycle", () => {
  it.each([
    "",
    "mongodb://localhost",
    "mongodb://localhost/?authSource=admin",
    "not-a-database-url",
  ])("rejects a missing database name without exposing the URL (%s)", (url) => {
    expect(() => createDatabaseV8(url)).toThrow(
      "DATABASE_URL must be a MongoDB URL with an explicit database name.",
    );
  });

  it("constructs the typed ORM without opening a connection", async () => {
    connection = createDatabaseV8(
      "mongodb://127.0.0.1:1/bidlane?authSource=admin",
    );
    expect(connection.database.databaseName).toBe("bidlane");
    expect(connection.db.contract.roots.Listing.model).toBe("Listing");
    expect(connection.db.orm.Listing).toBeDefined();
    await expect(connection.close()).resolves.toBeUndefined();
  });

  it("uses the selected database with a replica-set URL", () => {
    connection = createDatabaseV8(
      "mongodb://localhost:27017,localhost:27018/bidlane?replicaSet=rs0",
    );
    expect(connection.database.databaseName).toBe("bidlane");
  });

  it("returns a transaction's result and ends its session", async () => {
    connection = createDatabaseV8("mongodb://127.0.0.1:1/bidlane");
    let sessionUsed: ClientSession | undefined;
    const result = await connection.withTransaction(
      async (database, session) => {
        sessionUsed = session;
        expect(database).toBe(connection!.database);
        expect(session.inTransaction()).toBe(true);
        return { accepted: true };
      },
    );
    expect(result).toEqual({ accepted: true });
    expect(sessionUsed?.hasEnded).toBe(true);
  });

  it("propagates a failed transaction and still ends its session", async () => {
    connection = createDatabaseV8("mongodb://127.0.0.1:1/bidlane");
    let sessionUsed: ClientSession | undefined;
    const failure = new Error("auction changed");
    await expect(
      connection.withTransaction(async (_, session) => {
        sessionUsed = session;
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(sessionUsed?.hasEnded).toBe(true);
  });

  it("bounds transient callback retries and ends the exhausted session", async () => {
    connection = createDatabaseV8("mongodb://127.0.0.1:1/bidlane");
    let attempts = 0;
    let sessionUsed: ClientSession | undefined;
    await expect(
      connection.withTransaction(
        async (_, session) => {
          sessionUsed = session;
          attempts++;
          throw new MongoServerError({
            message: "write conflict",
            code: 112,
            errorLabels: ["TransientTransactionError"],
          });
        },
        { maxAttempts: 3, timeoutMS: 5000 },
      ),
    ).rejects.toBeInstanceOf(TransactionRetryLimitError);
    expect(attempts).toBe(3);
    expect(sessionUsed?.hasEnded).toBe(true);
  });
});
