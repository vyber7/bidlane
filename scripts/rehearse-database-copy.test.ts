import { describe, expect, it } from "vitest";
import ConnectionString from "mongodb-connection-string-url";
import { copyRehearsalUrl, restoreArguments } from "./rehearse-database-copy.mjs";

describe("restored-copy destination guard", () => {
  const base = "mongodb://127.0.0.1:28019/bidlane_test_migration_copy?replicaSet=test";
  it("uses a fresh namespace and prevents replica-set discovery from redirecting writes", () => {
    const url = copyRehearsalUrl(base);
    expect(url).not.toBe(copyRehearsalUrl(base));
    expect(new ConnectionString(url).searchParams.get("directConnection")).toBe("true");
    const args = restoreArguments("fixture", url, "/private/backup.gz");
    expect(args).toContain("--nsInclude=fixture.*");
    expect(args).toContain(`--nsTo=${new ConnectionString(url).pathname.slice(1)}.*`);
    expect(args).toContain("--stopOnError");
    expect(args).not.toContain("--drop");
    expect(args).not.toContain("--oplogReplay");
  });
  it.each([
    "mongodb://example.com/bidlane_test_migration_copy",
    "mongodb://127.0.0.1:28019/production",
    "mongodb://127.0.0.1:28019,bad.example/bidlane_test_migration_copy",
    `${base}&proxyHost=bad.example`,
    `${base}&directConnection=true&proxyHost=bad.example`,
    "mongodb://admin:private@127.0.0.1:28019/bidlane_test_migration_copy?directConnection=true",
  ])("refuses an unsafe local destination %s", (url) => {
    expect(() => copyRehearsalUrl(url)).toThrow();
    expect(() => restoreArguments("fixture", url, "/private/backup.gz")).toThrow();
  });
  it.each(["*", "fixture.*", "fixture\\*"])("refuses wildcard source namespaces %s", (name) => {
    expect(() => restoreArguments(name, copyRehearsalUrl(base), "/private/backup.gz")).toThrow();
  });
});
