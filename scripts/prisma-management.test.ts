import { describe, expect, it } from "vitest";
import { checkManagementPermissions, checkPlan } from "./prisma-management.mjs";

describe("reviewed database-management operations", () => {
  it("allows additive validators/collections on explicitly managed models", () => {
    expect(checkPlan({ operations: [{ id: "validator.Listing.add", operationClass: "widening" }, { id: "collection.Bid.create", operationClass: "additive" }] })).toEqual([]);
  });
  it.each(["collection.UploadedAsset.drop", "index.PasswordReset.drop(PasswordReset_tokenHash_key)", "validator.Listing.change", "validator.UploadedAsset.add", "collection.Unknown.create", "collection.Listing.drop", "future.operation"])("refuses unreviewed operation %s", (id) => {
    expect(checkPlan({ operations: [{ id, operationClass: "widening" }] })).toHaveLength(1);
  });
  it("fails closed without an operation inventory", () => { expect(() => checkPlan({})).toThrow("Missing migration operations"); });
  it("refuses a changed risk classification for an otherwise recognized operation", () => {
    expect(checkPlan({ operations: [{ id: "validator.User.add", operationClass: "destructive" }] })).toHaveLength(1);
  });
});

describe("planned management permissions", () => {
  const operations = [{ id: "validator.User.add" }, { id: "collection.Bid.create" }];
  const check = (privileges: { resource: Record<string, unknown>; actions: string[] }[]) => checkManagementPermissions({ authenticatedUsers: [{ user: "fixture", db: "admin" }], authenticatedUserPrivileges: privileges }, "fixture_dev", operations);

  it("identifies read/write credentials that cannot install validators without returning identities", () => {
    const report = check([{ resource: { db: "", collection: "" }, actions: ["find", "insert", "update", "createCollection"] }]);
    expect(report).toEqual({ checked: true, missing: [{ collection: "User", action: "collMod" }] });
    expect(JSON.stringify(report)).not.toContain("fixture");
  });
  it("accepts narrowly scoped privileges for the actual planned collections", () => {
    expect(check([{ resource: { db: "fixture_dev", collection: "User" }, actions: ["collMod"] }, { resource: { db: "fixture_dev", collection: "Bid" }, actions: ["createCollection"] }])).toEqual({ checked: true, missing: [] });
  });
  it.each([
    { db: "fixture_dev", collection: "" },
    { db: "", collection: "" },
    { anyResource: true },
  ])("recognizes broader matching resource grants %o", (resource) => {
    expect(check([{ resource, actions: ["collMod", "createCollection"] }]).missing).toEqual([]);
  });
  it.each([
    { db: "another_database", collection: "" },
    { db: "fixture_dev", collection: "AnotherCollection" },
    { cluster: true },
  ])("does not confuse unrelated grants with access to the managed collections %o", (resource) => {
    expect(check([{ resource, actions: ["collMod", "createCollection"] }]).missing).toHaveLength(2);
  });
  it("recognizes anyAction only on a matching resource", () => {
    expect(check([{ resource: { db: "fixture_dev", collection: "" }, actions: ["anyAction"] }]).missing).toEqual([]);
  });
  it("marks absent or unauthenticated inventories unchecked instead of claiming denied access", () => {
    expect(checkManagementPermissions(undefined, "fixture_dev", operations)).toEqual({ checked: false, missing: [] });
    expect(checkManagementPermissions({ authenticatedUsers: [] }, "fixture_dev", operations)).toEqual({ checked: false, missing: [] });
  });
});
