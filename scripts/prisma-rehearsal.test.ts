import { describe, expect, it } from "vitest";
import { rehearsalUrl } from "./prisma-rehearsal.mjs";

describe("disposable migration database guard", () => {
  it("creates a unique database without reusing the supplied base", () => {
    const url = "mongodb://127.0.0.1:28019/bidlane_test_migration_local?replicaSet=test";
    expect(rehearsalUrl(url)).not.toBe(url); expect(rehearsalUrl(url)).not.toBe(rehearsalUrl(url));
  });
  it.each(["mongodb://127.0.0.1:28019/production", "mongodb://localhost:28019/bidlane_test_migration_local", "mongodb://example.com/bidlane_test_migration_local", "mongodb://127.0.0.1:28019,example.com/bidlane_test_migration_local", "mongodb://127.0.0.1:28019/"])("refuses destructive rehearsal on %s", (url) => {
    expect(() => rehearsalUrl(url)).toThrow();
  });
});
