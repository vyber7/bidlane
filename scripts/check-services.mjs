import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import Pusher from "pusher";

export const cronPaths = [
  "/api/cron/finalize-auctions",
  "/api/cron/send-notification-emails",
  "/api/cron/send-recovery-emails",
  "/api/cron/ending-soon-reminders",
];

const passed = (check, detail) => ({ check, status: "passed", detail });
const failed = (check, detail) => ({ check, status: "failed", detail });
const missing = (env, keys) => keys.filter((key) => !env[key]?.trim());

export function checkCronConfiguration(config) {
  const jobs = config?.crons;
  if (!Array.isArray(jobs) || jobs.length !== cronPaths.length ||
      cronPaths.some((path) => jobs.filter((job) => job.path === path && job.schedule === "* * * * *").length !== 1)) {
    return failed("cron.configuration", "Expected all four workers exactly once, scheduled every minute.");
  }
  return passed("cron.configuration", "Four one-minute schedules configured; deployed jobs and hosting plan still require verification.");
}

// Authentication/metadata requests only. Never send mail, publish events,
// upload files, invoke workers, or read/write application database records.
export async function checkServices(env, config, clients = {}) {
  const fetchRequest = clients.fetch ?? fetch;
  const checks = [checkCronConfiguration(config)];
  const authMissing = missing(env, ["NEXTAUTH_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "GITHUB_ID", "GITHUB_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  let originValid = false;
  try {
    const url = new URL(env.NEXTAUTH_URL);
    originValid = !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch { /* A sanitized configuration failure is reported below. */ }
  checks.push(authMissing.length
    ? failed("auth.configuration", `Missing configuration: ${authMissing.join(", ")}.`)
    : !originValid ? failed("auth.configuration", "NEXTAUTH_URL must use HTTPS, or HTTP on loopback, without credentials, a query, or a fragment.")
      : passed("auth.configuration", "Authentication and scheduler configuration is present; OAuth callbacks require an account sign-in test."));

  async function configured(check, keys, run) {
    const absent = missing(env, keys);
    if (absent.length) return failed(check, `Missing configuration: ${absent.join(", ")}.`);
    try { return await run(); }
    catch { return failed(check, "Read-only service check did not complete. Check credentials, network access, and provider permissions."); }
  }
  checks.push(...await Promise.all([
    configured("cloudinary.credentials", ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"], async () => {
      const api = clients.cloudinary ?? cloudinary;
      api.config({ cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, api_key: env.NEXT_PUBLIC_CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET });
      const response = await api.api.ping({ timeout: 10_000 });
      return response?.status === "ok"
        ? passed("cloudinary.credentials", "Authenticated Admin API ping passed; file upload and delivery require a separate smoke test.")
        : failed("cloudinary.credentials", "The provider did not confirm a successful ping.");
    }),
    configured("pusher.credentials", ["PUSHER_APP_ID", "NEXT_PUBLIC_PUSHER_APP_KEY", "PUSHER_SECRET"], async () => {
      const options = { appId: env.PUSHER_APP_ID, key: env.NEXT_PUBLIC_PUSHER_APP_KEY, secret: env.PUSHER_SECRET, cluster: "us2", useTLS: true, timeout: 10_000 };
      const api = clients.createPusher ? clients.createPusher(options) : new Pusher(options);
      const response = await api.get({ path: "/channels" });
      await response.text(); // Consume the response without returning channel identities.
      return response.status === 200
        ? passed("pusher.credentials", "Authenticated channel API read passed; publish/subscribe delivery requires a separate smoke test.")
        : failed("pusher.credentials", "The provider rejected the read-only API request.");
    }),
    configured("resend.credentials", ["RESEND_API_KEY", "EMAIL_FROM"], async () => {
      const response = await fetchRequest("https://api.resend.com/domains", {
        method: "GET", headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}` }, signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      // Sending-only keys intentionally cannot list domains. Resend returns
      // 401 restricted_api_key for this case, rather than an invalid-key error.
      if ([401, 403].includes(response.status) && body?.name === "restricted_api_key") {
        return passed("resend.credentials", "Sending-only key recognized; domain verification and delivery require a separate email test.");
      }
      return response.ok && Array.isArray(body?.data)
        ? passed("resend.credentials", "Authenticated domain API read passed; sender configuration and delivery require a separate email test.")
        : failed("resend.credentials", "The provider did not authenticate the read-only request or recognize a sending-only key.");
    }),
  ]));
  return {
    checksPassed: checks.every((check) => check.status === "passed"),
    readOnly: true, checks,
    remaining: ["OAuth account callbacks", "Email sending and inbox delivery", "Pusher publish/subscribe delivery", "Cloudinary upload and file delivery", "Deployed cron schedules, hosting plan, and invocation logs"],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error("Unexpected arguments");
    const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
    const report = await checkServices(process.env, config);
    console.log(JSON.stringify(report, null, 2));
    if (!report.checksPassed) process.exitCode = 1;
  } catch {
    console.error("Service preflight did not complete. Check local configuration and run npm run services:check without additional arguments.");
    process.exitCode = 1;
  }
}
