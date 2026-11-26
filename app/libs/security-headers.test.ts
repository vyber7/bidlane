import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers.mjs";

function directives(policy: string) {
  return new Map(policy.split("; ").map((directive) => {
    const [name, ...values] = directive.split(" ");
    return [name, values] as const;
  }));
}

describe("security headers", () => {
  it("reports the policy without enforcing it yet", () => {
    const keys = securityHeaders().map(({ key }) => key);
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
  });

  it("forbids framing, plugins and foreign form targets", () => {
    const policy = directives(contentSecurityPolicy());
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
  });

  it("allows the services the browser talks to", () => {
    const policy = directives(contentSecurityPolicy());
    expect(policy.get("img-src")).toEqual(expect.arrayContaining(["https://res.cloudinary.com", "https://avatars.githubusercontent.com"]));
    expect(policy.get("connect-src")).toEqual(expect.arrayContaining(["wss://ws-us2.pusher.com"]));
  });

  it("allows eval and skips HSTS only in development", () => {
    expect(directives(contentSecurityPolicy()).get("script-src")).not.toContain("'unsafe-eval'");
    expect(directives(contentSecurityPolicy({ dev: true })).get("script-src")).toContain("'unsafe-eval'");
    expect(securityHeaders().map(({ key }) => key)).toContain("Strict-Transport-Security");
    expect(securityHeaders({ dev: true }).map(({ key }) => key)).not.toContain("Strict-Transport-Security");
  });

  it("allows Vercel's toolbar only on preview deployments", () => {
    expect(contentSecurityPolicy()).not.toContain("vercel.live");
    expect(directives(contentSecurityPolicy({ preview: true })).get("frame-src")).toContain("https://vercel.live");
  });
});
