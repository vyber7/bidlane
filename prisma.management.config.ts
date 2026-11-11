import { definePrismaConfig } from "prisma/config";
import { defineConfig } from "@prisma/orm-mongo/config";

// Used by the guarded scripts, not by normal offline contract emission.
export default definePrismaConfig({
  parent: false,
  orm: defineConfig({
    contract: "prisma/v8/contract.ts",
    db: { connection: process.env.DATABASE_URL },
    // Adoption uses live diffs, not a committed migration graph. CLI refs and
    // snapshots belong to the guarded command's temporary state directory.
    migrations: { dir: process.env.BIDLANE_MANAGEMENT_STATE_DIR ?? "node_modules/.bidlane-management-state" },
  }),
});
