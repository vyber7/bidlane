import { getDatabaseV8 } from "./prismadb-v8";
import { createReadRepositories } from "@/prisma/reads/repositories";

export function getReadRepositories() {
  return createReadRepositories(getDatabaseV8());
}
