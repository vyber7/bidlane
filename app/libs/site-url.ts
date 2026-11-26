/**
 * The public origin for canonical links, Open Graph URLs, robots.txt and the
 * sitemap. NEXTAUTH_URL comes before Vercel's production domain because it
 * names the host sign-in already uses (www); Vercel may report the apex
 * domain, which only redirects.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim()
    || env.NEXTAUTH_URL?.trim()
    || (env.VERCEL_PROJECT_PRODUCTION_URL?.trim() && `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`)
    || "http://localhost:3000";
  return new URL(configured);
}

/** Only production should be indexed; previews and branch deployments stay out of search. */
export function isIndexable(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}
