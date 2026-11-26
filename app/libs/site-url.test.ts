import { describe, expect, it } from "vitest";
import { isIndexable, siteUrl } from "./site-url";

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe("site URL", () => {
  it("prefers the configured URL, then NEXTAUTH_URL, then Vercel's production domain", () => {
    expect(siteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://www.bidlane.net", NEXTAUTH_URL: "https://other.example" })).origin).toBe("https://www.bidlane.net");
    expect(siteUrl(env({ NEXTAUTH_URL: "https://www.bidlane.net", VERCEL_PROJECT_PRODUCTION_URL: "bidlane.net" })).origin).toBe("https://www.bidlane.net");
    expect(siteUrl(env({ VERCEL_PROJECT_PRODUCTION_URL: "bidlane.net" })).origin).toBe("https://bidlane.net");
    expect(siteUrl(env({})).origin).toBe("http://localhost:3000");
  });

  it("indexes production only", () => {
    expect(isIndexable(env({ VERCEL_ENV: "production" }))).toBe(true);
    expect(isIndexable(env({ VERCEL_ENV: "preview", NODE_ENV: "production" }))).toBe(false);
    expect(isIndexable(env({ NODE_ENV: "production" }))).toBe(true);
    expect(isIndexable(env({ NODE_ENV: "development" }))).toBe(false);
  });
});
