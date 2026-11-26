import { afterEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";

const publicListings = vi.hoisted(() => vi.fn());
vi.mock("./libs/read-repositories", () => ({ getReadRepositories: () => ({ listings: { public: publicListings } }) }));

import sitemap from "./sitemap";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap", () => {
  it("lists public pages, public Listings and their sellers once each", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bidlane.net");
    const updatedAt = new Date("2026-11-01T00:00:00Z");
    publicListings.mockResolvedValue([
      makeListing({ id: "a".repeat(24), userId: "b".repeat(24), updatedAt }),
      makeListing({ id: "c".repeat(24), userId: "b".repeat(24), updatedAt: null }),
    ]);
    const entries = await sitemap();
    expect(entries.map(({ url }) => url)).toEqual([
      "https://bidlane.net/", "https://bidlane.net/about", "https://bidlane.net/faq",
      "https://bidlane.net/contact", "https://bidlane.net/privacy", "https://bidlane.net/terms",
      `https://bidlane.net/listing/${"a".repeat(24)}`, `https://bidlane.net/listing/${"c".repeat(24)}`,
      `https://bidlane.net/sellers/${"b".repeat(24)}`,
    ]);
    expect(entries[6].lastModified).toEqual(updatedAt);
    // Falls back to when the Listing was created.
    expect(entries[7].lastModified).toEqual(makeListing().createdAt);
  });
});

describe("robots.txt", () => {
  it("points production crawlers at the sitemap and away from private routes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bidlane.net");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/account/", "/admin/", "/submit-listing"] },
      sitemap: "https://bidlane.net/sitemap.xml",
    });
  });

  it("keeps preview deployments out of search entirely", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
