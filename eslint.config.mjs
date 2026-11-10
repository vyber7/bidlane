import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.cjs"],
    rules: {
      // CommonJS scripts use require() by design.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "prisma/v8/contract.d.ts"]),
]);
