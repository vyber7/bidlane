import "server-only";
import { createDatabaseV8, type DatabaseV8 } from "@/prisma/v8/client";

declare global {
  var databaseV8: DatabaseV8 | undefined;
}

let productionDatabase: DatabaseV8 | undefined;

// Opt-in only: existing routes keep importing ./prismadb until their writes,
// defaults, error handling, and transaction boundaries have been migrated.
export function getDatabaseV8() {
  if (process.env.NODE_ENV === "production") {
    return productionDatabase ??= createDatabaseV8(process.env.DATABASE_URL ?? "");
  }
  return globalThis.databaseV8 ??= createDatabaseV8(process.env.DATABASE_URL ?? "");
}
