import { v2 as cloudinary } from "cloudinary";
import { pathToFileURL } from "node:url";

const preset = "auctions";

export async function secureUploads(args, api, fetchDeployment = fetch) {
  const [action, flag, deployment, ...extra] = args;
  if (action === "check" && args.length === 1) {
    const current = await api.upload_preset(preset, { timeout: 10000 });
    return current.unsigned === false ? "The auctions preset requires signed uploads." : "The auctions preset still permits unsigned uploads. Deploy the secured uploader before cutover.";
  }
  if (action !== "apply" || flag !== "--deployment-url" || !deployment || extra.length) {
    throw new Error("Usage: npm run uploads:check OR npm run uploads:secure -- --deployment-url https://your-production-domain");
  }
  const origin = new URL(deployment);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("Use the HTTPS origin of the deployed production site.");
  }
  const endpoint = new URL("/api/uploads", origin);
  const options = { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" };
  const readiness = await fetchDeployment(endpoint, options);
  const policy = readiness.ok ? await readiness.json() : null;
  if (policy?.policy !== "authenticated-4mb-v1" || policy.maxBytes !== 4_000_000) {
    throw new Error("The production site is not serving the secured uploader. No preset change was made.");
  }
  const unauthorized = await fetchDeployment(endpoint, { ...options, method: "POST", signal: AbortSignal.timeout(15000) });
  if (unauthorized.status !== 401) {
    throw new Error("The production uploader did not reject an unauthenticated upload. No preset change was made.");
  }
  // Switch only after the replacement code is reachable. Existing asset URLs
  // remain valid; old cached widgets must be refreshed after this point.
  await api.update_upload_preset(preset, { unsigned: false, timeout: 10000 });
  const updated = await api.upload_preset(preset, { timeout: 10000 });
  if (updated.unsigned !== false) throw new Error("Could not verify that unsigned uploads are disabled. Check Cloudinary before continuing.");
  return "Cutover complete: the production uploader requires authentication and the auctions preset requires signed uploads.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || !process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("Configure the Cloudinary cloud name, API key, and server API secret before running this command.");
    process.exitCode = 1;
  } else {
    cloudinary.config({ cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    try { console.log(await secureUploads(process.argv.slice(2), cloudinary.api)); }
    catch {
      // SDK and fetch errors can include credentials or infrastructure details.
      console.error("Upload cutover did not complete. Confirm the production URL serves the secured uploader, then check Cloudinary configuration and preset state with npm run uploads:check before retrying.");
      process.exitCode = 1;
    }
  }
}
