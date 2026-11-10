import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import contract from "./contract.json";

const models = contract.domain.namespaces.__unbound__.models;
const collections = contract.storage.namespaces.__unbound__.entries.collection;
const nativeCollections = [
  "ContactRateLimit", "UploadedAsset", "UploadQuota", "AbuseQuota",
  "PasswordReset", "PasswordResetQuota", "RecoveryEmail",
];

describe("Prisma 8 storage compatibility", () => {
  it("accounts for every v6 collection without changing string IDs to ObjectIds", () => {
    expect([...Object.keys(models), ...nativeCollections].sort()).toEqual(
      Prisma.dmmf.datamodel.models.map((model) => model.name).sort(),
    );
    for (const name of nativeCollections) {
      const id = Prisma.dmmf.datamodel.models.find((model) => model.name === name)!.fields.find((field) => field.isId)!;
      expect(id.type).toBe("String");
      expect(id.nativeType).toBeNull();
    }
  });

  for (const [name, model] of Object.entries(models)) {
    it(`preserves ${name}'s stored fields, types, nullability, and collection name`, () => {
      const legacy = Prisma.dmmf.datamodel.models.find((item) => item.name === name)!;
      const fields = legacy.fields.filter((field) => field.kind !== "object");
      expect(model.storage.collection).toBe(legacy.dbName ?? legacy.name);
      expect(Object.keys(model.fields).sort()).toEqual(fields.map((field) => field.name).sort());
      for (const field of fields) {
        const migrated = model.fields[field.name as keyof typeof model.fields];
        expect(migrated.nullable).toBe(!field.isRequired);
        expect("many" in migrated).toBe(field.isList);
        const codec = field.nativeType?.[0] === "ObjectId" ? "objectId"
          : field.kind === "enum" ? "string"
          : ({ String: "string", Int: "int64Number", Boolean: "bool", DateTime: "date", Json: "json" }[field.type]);
        expect(codec).toBeDefined();
        expect(migrated.type).toEqual({ kind: "scalar", codecId: `mongo/${codec}@1` });
        expect(model.storage.fields[field.name as keyof typeof model.storage.fields]).toEqual({ field: field.dbName ?? field.name });
      }
    });
  }

  it("preserves enum storage values for roles, moderation, and notifications", () => {
    const enums = contract.domain.namespaces.__unbound__.enum;
    // UploadKind belongs to UploadedAsset, which keeps its native string ID.
    expect([...Object.keys(enums), "UploadKind"].sort()).toEqual(Prisma.dmmf.datamodel.enums.map((item) => item.name).sort());
    for (const [name, current] of Object.entries(enums)) {
      const legacy = Prisma.dmmf.datamodel.enums.find((item) => item.name === name)!;
      expect(current.members).toEqual(legacy.values.map((member) => ({ name: member.name, value: member.dbName ?? member.name })));
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
  });
});
