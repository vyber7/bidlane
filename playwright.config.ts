import { defineConfig } from "@playwright/test";
import ConnectionString from "mongodb-connection-string-url";

const databaseUrl = process.env.E2E_MONGODB_URL;
if (!databaseUrl) throw new Error("Set E2E_MONGODB_URL to an empty local test database.");
const database = new ConnectionString(databaseUrl);
if (
  database.hosts.length !== 1 ||
  !/^127\.0\.0\.1:\d+$/.test(database.hosts[0]) ||
  !/^\/bidlane_test_e2e_[a-z0-9_]+$/.test(database.pathname) ||
  !database.searchParams.get("replicaSet")
) {
  throw new Error("Browser tests require a loopback replica set and a bidlane_test_e2e_ database.");
}

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "artifacts/playwright",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL,
    browserName: "chromium",
    timezoneId: "UTC",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start -- --hostname 127.0.0.1 --port 3100",
    url: `${baseURL}/signin`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: databaseUrl,
      TZ: "UTC",
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: "browser-test-session-secret",
      CRON_SECRET: "browser-test-cron-secret",
      PUSHER_APP_ID: "1",
      NEXT_PUBLIC_PUSHER_APP_KEY: "ci-pusher-key",
      PUSHER_SECRET: "ci-pusher-secret",
      // Fail closed on outbound HTTP(S) calls from the test server, including Pusher.
      NODE_USE_ENV_PROXY: "1",
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
      NO_PROXY: "127.0.0.1,localhost",
    },
  },
});
