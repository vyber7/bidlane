import { randomUUID, createHash } from "node:crypto";
import { BSON, Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import contract from "../prisma/v8/contract.json" with { type: "json" };
import { ensureNativeIndexes } from "../prisma/native/indexes.mjs";
import { nativeCollections } from "./prisma-management.mjs";

export function rehearsalUrl(url) {
  const parsed = new ConnectionString(url);
  if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_migration_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Rehearsal requires a loopback bidlane_test_migration_ database");
  parsed.pathname = `${parsed.pathname.slice(0, 44)}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  return parsed.toString();
}

// Independent BSON fixtures, not a dump of user data or a generated v6 client.
export async function seedRehearsal(database) {
  const now = new Date("2026-01-01T12:00:00Z");
  const entries = contract.storage.namespaces.__unbound__.entries.collection;
  const ids = Object.fromEntries(Object.keys(entries).map((name, index) => [name, new ObjectId((index + 1).toString(16).padStart(24, "0"))]));
  const rows = {};
  for (const [name, entry] of Object.entries(entries)) {
    const schema = entry.validator.jsonSchema, document = {};
    for (const [field, spec] of Object.entries(schema.properties)) {
      if (!schema.required.includes(field)) { document[field] = null; continue; }
      const type = Array.isArray(spec.bsonType) ? spec.bsonType.find((item) => item !== "null") : spec.bsonType;
      document[field] = spec.enum ? spec.enum[0] : type === "objectId" ? (field === "_id" ? ids[name] : field === "listingId" ? ids.Listing : ids.User)
        : type === "long" ? Long.ONE : type === "date" ? now : type === "array" ? [] : type === "bool" ? true
        : type === "string" ? (field === "email" ? `${name.toLowerCase()}@example.test` : `fixture-${name}-${field}`) : { fixture: true };
    }
    await database.collection(name).insertOne(document); rows[name] = document;
  }
  for (const name of nativeCollections) {
    const document = name === "UploadedAsset" ? { _id: "fixture:asset", userId: ids.User, kind: "PHOTO", listingId: null, url: "https://example.test/fixture.jpg", bytes: Long.ONE, format: "jpg", createdAt: now }
      : name === "PasswordReset" ? { _id: "fixture:reset", email: "fixture@example.test", nonce: "nonce", tokenHash: "fixture-reset-hash", requestedAt: now, expiresAt: now, userId: ids.User, sessionVersion: "session", usedAt: null }
      : name === "RecoveryEmail" ? { _id: "fixture:recovery", email: "fixture@example.test", kind: "RESET", resetId: "fixture:reset", nonce: "nonce", status: "PENDING", attempts: Long.ZERO, nextAttemptAt: now, lockedUntil: null, lockToken: null, createdAt: now }
      : { _id: `fixture:${name}`, count: Long.ONE, expiresAt: now };
    await database.collection(name).insertOne(document);
  }
  await database.collection("OperationalNotes").insertOne({ _id: "fixture:note", note: "Unmanaged storage must survive" });
  await database.collection("RecoveryEmail").createIndex({ email: 1 }, { name: "External_delivery_lookup" });
  await ensureNativeIndexes(database);
  return rows;
}

export async function fingerprint(database, names) {
  const result = {};
  for (const name of names) {
    const documents = await database.collection(name).find({}).sort({ _id: 1 }).toArray();
    const hash = createHash("sha256");
    for (const document of documents) hash.update(BSON.serialize(document));
    result[name] = { documents: documents.length, hash: hash.digest("hex"), indexes: await database.collection(name).listIndexes().toArray() };
  }
  return result;
}
