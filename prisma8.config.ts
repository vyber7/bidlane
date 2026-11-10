import { definePrismaConfig } from "prisma-v8/config";
import { defineConfig } from "@prisma/orm-mongo/config";

// Emission is offline. Database management remains with v6 until cutover.
export default definePrismaConfig({
  parent: false,
  orm: defineConfig({
    contract: "prisma/v8/contract.ts",
  }),
});
