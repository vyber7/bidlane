import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next.js resolves this guard at build time; tests run server modules directly.
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // LocalTime reformats dates in the runtime time zone after mount; pin it
    // so date assertions don't depend on the machine running the tests.
    env: { TZ: "UTC" },
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
