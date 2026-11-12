import "server-only";
import { createDatabaseV8, type DatabaseV8 } from "@/prisma/v8/client";

declare global {
  var databaseV8: DatabaseV8 | undefined;
}

let productionDatabase: DatabaseV8 | undefined;

// Application reads use the typed v8 client; native repositories share its
// pool for transactions, legacy string-ID collections, and indexed counts.
export function getDatabaseV8() {
  if (process.env.NODE_ENV === "production") {
    return productionDatabase ??= createDatabaseV8(process.env.DATABASE_URL ?? "");
  }
  return globalThis.databaseV8 ??= createDatabaseV8(process.env.DATABASE_URL ?? "");
}
