import type { MetadataRoute } from "next";
import { isIndexable, siteUrl } from "./libs/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // Previews would otherwise compete with production in search results.
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in and API routes have nothing for search engines.
      disallow: ["/api/", "/account/", "/admin/", "/submit-listing"],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
