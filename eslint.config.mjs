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
  {
    files: ["app/**/*.{js,jsx,mjs,ts,tsx}"],
    ignores: ["app/libs/realtime/pusher-*-transport.ts"],
    rules: {
      // Real-time updates go through the event channel in app/libs/realtime.
      // Only its Pusher transports talk to Pusher.
      "no-restricted-imports": ["error", {
        paths: ["pusher", "pusher-js"].map((name) => ({
          name,
          message: "Publish with app/libs/realtime/server or subscribe with app/libs/realtime/client instead.",
        })),
      }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "prisma/v8/contract.d.ts"]),
]);
