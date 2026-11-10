import { describe, expect, it } from "vitest";
import { checkPlan } from "./prisma-management.mjs";

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
