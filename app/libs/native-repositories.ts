import { getDatabaseV8 } from "./prismadb-v8";
import { createNativeRepositories, type NativeRepositories } from "@/prisma/native/repositories";

export function getNativeRepositories() {
  return createNativeRepositories(getDatabaseV8().database);
}

export function withNativeTransaction<T>(operation: (repositories: NativeRepositories) => Promise<T>) {
  return getDatabaseV8().withTransaction((database, session) => operation(createNativeRepositories(database, session)));
}
