import { MongoClient } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";

export function createMongoConnection(url) {
  // Never silently fall back to the driver's default "test" database.
  try {
    if (!new ConnectionString(url).pathname.slice(1)) throw new Error();
  } catch {
    throw new Error(
      "DATABASE_URL must be a MongoDB URL with an explicit database name.",
    );
  }
  const mongoClient = new MongoClient(url, {
    serverSelectionTimeoutMS: 10_000,
  });
  return { mongoClient, database: mongoClient.db() };
}
