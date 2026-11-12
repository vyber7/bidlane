import { pathToFileURL } from "node:url";
import contract from "../prisma/v8/contract.json" with { type: "json" };
import { createMongoConnection } from "../prisma/v8/connection.mjs";
import { auditDatabase } from "./prisma-management.mjs";

// These are the existing Prisma 6 read defaults and native user-create values.
// Optional proof/role/profile fields and every existing value remain untouched.
export const userDefaults = {
  BidOnListIds: [], highestBidsIds: [], listingsCommentedOnIds: [],
  seenListIds: [], watchListIds: [], endingSoonEmailsEnabled: true,
};
const schema = contract.storage.namespaces.__unbound__.entries.collection.User.validator.jsonSchema;
const missing = { $or: Object.keys(userDefaults).map((field) => ({ [field]: { $exists: false } })) };
const setDefaults = Object.fromEntries(Object.entries(userDefaults).map(([field, value]) => [field, {
  $cond: [{ $eq: [{ $type: `$${field}` }, "missing"] }, { $literal: value }, `$${field}`],
}]));

async function userPlan(database, session) {
  const users = database.collection("User"), options = { session };
  const changes = [];
  for (const [field, value] of Object.entries(userDefaults)) {
    const documents = await users.countDocuments({ [field]: { $exists: false } }, options);
    changes.push({ field, value, documents });
  }
  const total = await users.countDocuments({}, options);
  const documentsToChange = await users.countDocuments(missing, options);
  const invalidBefore = await users.countDocuments({ $nor: [{ $jsonSchema: schema }] }, options);
  // This is a projection, not an update. Validate the prospective documents
  // on the server without exporting identities, credentials, or user values.
  const [after] = await users.aggregate([
    { $set: setDefaults }, { $match: { $nor: [{ $jsonSchema: schema }] } }, { $count: "invalid" },
  ], options).toArray();
  return { total, documentsToChange, fieldsToAdd: changes.reduce((sum, change) => sum + change.documents, 0), changes, invalidBefore, invalidAfter: after?.invalid ?? 0 };
}

export async function planUserDefaults(database) {
  const audit = await auditDatabase(database);
  const users = await userPlan(database);
  const otherInvalidCollections = audit.collections.filter((entry) => entry.collection !== "User" && entry.invalidDocuments > 0).map(({ collection, invalidDocuments }) => ({ collection, invalidDocuments }));
  const invalidNativeIdCollections = audit.nativeCollections.filter((entry) => Object.keys(entry.idTypes).some((type) => type !== "string"));
  return {
    ready: users.invalidAfter === 0 && otherInvalidCollections.length === 0 && audit.indexIssues.length === 0 && invalidNativeIdCollections.length === 0,
    mode: "preview", collection: "User", storageHash: audit.storageHash, ...users,
    otherInvalidCollections, indexIssues: audit.indexIssues, invalidNativeIdCollections,
  };
}

export async function applyUserDefaults(database, mongoClient) {
  const preview = await planUserDefaults(database);
  if (!preview.ready) return { ...preview, mode: "blocked", modifiedDocuments: 0 };
  const result = await mongoClient.withSession(async (session) => {
    let attempts = 0;
    return session.withTransaction(async () => {
      if (++attempts > 3) throw new Error("Backfill retry limit reached");
      const current = await userPlan(database, session);
      if (current.invalidAfter !== 0) throw new Error("User data changed; backfill refused");
      const written = await database.collection("User").updateMany(missing, [{ $set: setDefaults }], { session });
      if (await database.collection("User").countDocuments({ $nor: [{ $jsonSchema: schema }] }, { session })) throw new Error("Post-backfill validation failed");
      return { ...current, modifiedDocuments: written.modifiedCount };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", timeoutMS: 5_000 });
  });
  return { ...preview, ...result, mode: "applied" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) throw new Error("Unsupported arguments");
    connection = createMongoConnection(process.env.DATABASE_URL ?? "");
    const result = args.length ? await applyUserDefaults(connection.database, connection.mongoClient) : await planUserDefaults(connection.database);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch {
    console.error("User-default backfill did not complete. Review the preview, database access, and transaction support. No existing/null values are repaired automatically.");
    process.exitCode = 1;
  } finally { await connection?.mongoClient.close(); }
}
