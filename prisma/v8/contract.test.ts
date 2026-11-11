import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import contract from "./contract.json";
import { nativeCollections as nativeInventory } from "../../scripts/prisma-management.mjs";

const models = contract.domain.namespaces.__unbound__.models;
const collections = contract.storage.namespaces.__unbound__.entries.collection;
const nativeCollections = [
  "ContactRateLimit", "UploadedAsset", "UploadQuota", "AbuseQuota",
  "PasswordReset", "PasswordResetQuota", "RecoveryEmail",
];

// Independently reviewed persistence requirements, not generated model metadata.
// Changes here require reviewing stored BSON compatibility, not just re-emission.
const storedFields = {
  Account: { objectId: "id userId", string: "type provider providerAccountId", "string?": "refresh_token access_token token_type scope id_token session_state", "int64Number?": "refresh_token_expires_in expires_at" },
  User: { objectId: "id", "string?": "name email role image sessionVersion hashedPassword", "date?": "emailVerified", date: "createdAt updatedAt", bool: "outbidEmailsEnabled endingSoonEmailsEnabled", "objectId[]": "listingsCommentedOnIds watchListIds BidOnListIds seenListIds highestBidsIds" },
  Notification: { objectId: "id userId", string: "eventKey kind title message href actionLabel tone", date: "createdAt", "date?": "readAt emailNextAttemptAt emailLockedUntil emailFirstAttemptAt emailSentAt", "objectId?": "emailListingId", "string?": "emailStatus emailLockToken emailProviderId emailLastError", int64Number: "emailAttempts", "json?": "emailPayload" },
  Listing: { objectId: "id userId", int64Number: "year miles views", string: "make model location description status", "string[]": "images", "string?": "transmission drivetrain titleStatus serviceHistory modifications vin knownFlaws coverImage result reviewStatus reviewNote", "json?": "vehicleRecords", "int64Number?": "reservePrice reviewRevision startingBid currentBid bidIncrement", date: "createdAt", "date?": "lastCommentAt updatedAt auctionStartsAt auctionEndsAt endingSoonReminderAt", bool: "isFeatured", "objectId[]": "biddersIds seenIds watchersIds commentsIds commenterIds", "objectId?": "highestBidderId" },
  ListingReview: { objectId: "id listingId reviewerId", string: "reviewerName decision", "string?": "reason", int64Number: "revision", date: "createdAt" },
  Comment: { objectId: "id listingId", "objectId?": "userId", "string?": "body image", date: "createdAt" },
  Bid: { objectId: "id listingId userId", int64Number: "amount", date: "createdAt" },
  BidSubmission: { objectId: "id userId listingId", string: "key", int64Number: "amount", json: "response", date: "createdAt" },
  EmailVerification: { objectId: "id", string: "email tokenHash", date: "requestedAt expiresAt" },
  ListingDraft: { objectId: "id userId", json: "payload", int64Number: "revision", string: "lastSaveKey", "objectId?": "publishedListingId", "date?": "deletedAt", date: "createdAt updatedAt" },
} as const;
const storedEnums = {
  UserRole: ["USER", "ADMIN"], NotificationKind: ["bid", "auction", "comment"],
  NotificationTone: ["success", "warning", "neutral"],
  EmailDeliveryStatus: ["PENDING", "SENDING", "SENT", "SKIPPED", "FAILED"],
  ListingReviewStatus: ["PENDING", "APPROVED", "CHANGES_REQUESTED"],
} as const;

describe("Prisma 8 storage compatibility", () => {
  it("manages only the declared ObjectId collections and tolerates native/operational collections", () => {
    expect(contract.defaultControlPolicy).toBe("tolerated");
    for (const definition of Object.values(collections)) expect(definition.control).toBe("managed");
    for (const name of nativeCollections) expect(Object.hasOwn(collections, name)).toBe(false);
  });
  it("emits the committed contract and types from the TypeScript source", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    // Emitted type imports are resolved relative to the output directory.
    // Stay in this package's dependency context, outside TypeScript's inputs.
    const output = mkdtempSync(join(root, "node_modules/.bidlane-contract-"));
    try {
      // Offline compilation also catches source/artifact drift before a build.
      execFileSync(process.execPath, [
        join(root, "node_modules/prisma/dist/prisma.js"), "contract", "emit",
        "--config", join(root, "prisma.config.ts"), "--output-path", output,
      ], { cwd: root, timeout: 25_000, stdio: "pipe" });
      for (const name of ["contract.json", "contract.d.ts"]) {
        expect(readFileSync(join(output, name), "utf8")).toBe(readFileSync(new URL(name, import.meta.url), "utf8"));
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 30_000);

  it("accounts for all ten managed and seven native collections", () => {
    expect(Object.keys(models).sort()).toEqual(Object.keys(storedFields).sort());
    expect(Object.keys(collections).sort()).toEqual(Object.keys(storedFields).sort());
    expect([...nativeInventory].sort()).toEqual([...nativeCollections].sort());
  });

  for (const [name, groups] of Object.entries(storedFields)) {
    it(`preserves ${name}'s stored fields, types, nullability, and collection name`, () => {
      const model = models[name as keyof typeof models];
      const fields = Object.entries(groups).flatMap(([type, names]) => names.split(" ").map((name) => ({ name, type })));
      expect(model.storage.collection).toBe(name);
      expect(Object.keys(model.fields).sort()).toEqual(fields.map((field) => field.name).sort());
      for (const { name, type } of fields) {
        const migrated = model.fields[name as keyof typeof model.fields];
        expect(migrated.nullable).toBe(type.endsWith("?"));
        expect("many" in migrated).toBe(type.endsWith("[]"));
        expect(migrated.type).toEqual({ kind: "scalar", codecId: `mongo/${type.replace(/\?|\[\]/g, "")}@1` });
        expect(model.storage.fields[name as keyof typeof model.storage.fields]).toEqual({ field: name === "id" ? "_id" : name });
      }
    });
  }

  it("preserves enum storage values for roles, moderation, and notifications", () => {
    const enums = contract.domain.namespaces.__unbound__.enum;
    expect(Object.keys(enums).sort()).toEqual(Object.keys(storedEnums).sort());
    for (const [name, values] of Object.entries(storedEnums)) {
      expect(enums[name as keyof typeof enums].members).toEqual(values.map((value) => ({ name: value, value })));
    }
  });

  it("preserves existing unique index names and keys used for authentication and idempotency", () => {
    expect(collections.Account.indexes).toContainEqual({
      kind: "mongo-index", name: "Account_provider_providerAccountId_key", unique: true,
      keys: [{ field: "provider", direction: 1 }, { field: "providerAccountId", direction: 1 }],
    });
    expect(collections.BidSubmission.indexes).toContainEqual({
      kind: "mongo-index", name: "BidSubmission_userId_key_key", unique: true,
      keys: [{ field: "userId", direction: 1 }, { field: "key", direction: 1 }],
    });
    expect(collections.User.indexes).toContainEqual({
      kind: "mongo-index", name: "User_email_key", unique: true,
      keys: [{ field: "email", direction: 1 }],
    });
    expect(collections.Notification.indexes).toContainEqual({
      kind: "mongo-index", name: "Notification_userId_eventKey_key", unique: true,
      keys: [{ field: "userId", direction: 1 }, { field: "eventKey", direction: 1 }],
    });
    // Prisma 6 names indexes using the stored field name (_id), not id.
    expect(collections.Notification.indexes).toContainEqual({
      kind: "mongo-index", name: "Notification_userId_createdAt__id_idx",
      keys: [{ field: "userId", direction: 1 }, { field: "createdAt", direction: 1 }, { field: "_id", direction: 1 }],
    });
  });
});
