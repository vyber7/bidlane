import { getDatabaseV8 } from "./prismadb-v8";
import { createNativeRepositories, type NativeRepositories } from "@/prisma/native/repositories";
import type { NativeTransactionOptions } from "@/prisma/v8/client";

export function getNativeRepositories() {
  return createNativeRepositories(getDatabaseV8().database);
}

export function withNativeTransaction<T>(operation: (repositories: NativeRepositories) => Promise<T>, options?: NativeTransactionOptions) {
  return getDatabaseV8().withTransaction((database, session) => operation(createNativeRepositories(database, session)), options);
}
