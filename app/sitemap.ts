import type { MetadataRoute } from "next";
import { getReadRepositories } from "./libs/read-repositories";
import { siteUrl } from "./libs/site-url";

// Listings change as they are approved, so read them per request rather than at build.
export const dynamic = "force-dynamic";

const pages = ["/", "/about", "/faq", "/contact", "/privacy", "/terms"];

/** Public pages, every public Listing, and the profiles of sellers who have one. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const listings = await getReadRepositories().listings.public();
  const sellers = [...new Set(listings.map((listing) => listing.userId))];
  return [
    ...pages.map((path) => ({ url: url(path) })),
    ...listings.map((listing) => ({
      url: url(`/listing/${listing.id}`),
      lastModified: listing.updatedAt ?? listing.createdAt,
    })),
    ...sellers.map((id) => ({ url: url(`/sellers/${id}`) })),
  ];
}
