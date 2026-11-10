import mongo from "@prisma/orm-mongo/runtime";
import { contractFromJson } from "@prisma/orm-mongo/static";
import type { ClientSession, Db } from "mongodb";
import { createMongoConnection } from "./connection.mjs";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

export function createDatabaseV8(url: string) {
  const { mongoClient, database } = createMongoConnection(url);
  const db = mongo({ contract, mongoClient, dbName: database.databaseName });

  return {
    db,
    database,
    mongoClient,
    // Prisma 8 queries do not join this session. Use native driver operations,
    // passing { session } to every operation, sequentially. Publish only after
    // this promise resolves: the driver may retry the entire callback.
    withTransaction<T>(operation: (database: Db, session: ClientSession) => Promise<T>) {
      return mongoClient.withSession((session) => session.withTransaction(
        () => operation(database, session),
        { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" },
      ));
    },
    async close() {
      try {
        await db.close();
      } finally {
        // The ORM does not own the externally supplied driver's pool.
        await mongoClient.close();
      }
    },
  };
}

export type DatabaseV8 = ReturnType<typeof createDatabaseV8>;
