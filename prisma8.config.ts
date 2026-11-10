import { definePrismaConfig } from "prisma-v8/config";
import { defineConfig } from "@prisma/orm-mongo/config";

// Emission is offline. Guarded database adoption uses prisma.management.config.ts.
export default definePrismaConfig({
  parent: false,
  orm: defineConfig({
    contract: "prisma/v8/contract.ts",
  }),
});
