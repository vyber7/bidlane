import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contract from "../prisma/v8/contract.json" with { type: "json" };
import { createMongoConnection } from "../prisma/v8/connection.mjs";
import { checkNativeIndexes } from "../prisma/native/indexes.mjs";

export const nativeCollections = ["ContactRateLimit", "UploadedAsset", "UploadQuota", "AbuseQuota", "PasswordReset", "PasswordResetQuota", "RecoveryEmail"];
const managed = contract.storage.namespaces.__unbound__.entries.collection;
const root = fileURLToPath(new URL("../", import.meta.url));
const execute = promisify(execFile);

// Reports only counts, BSON type names and field names, never document values,
// identities, token hashes, credentials, URLs, or provider payloads.
export async function auditDatabase(database) {
  const issues = await checkNativeIndexes(database);
  const collections = [];
  for (const [name, definition] of Object.entries(managed)) {
    if (definition.control !== "managed" || !definition.validator?.jsonSchema) throw new Error("Missing managed validator");
    const collection = database.collection(name), schema = definition.validator.jsonSchema;
    const total = await collection.countDocuments();
    const invalidDocuments = await collection.countDocuments({ $nor: [{ $jsonSchema: schema }] });
    const types = await collection.aggregate([
      { $project: { fields: { $objectToArray: "$$ROOT" } } }, { $unwind: "$fields" },
      { $group: { _id: { field: "$fields.k", type: { $type: "$fields.v" } }, count: { $sum: 1 } } },
      { $sort: { "_id.field": 1, "_id.type": 1 } },
    ]).toArray();
    const fields = Object.keys(schema.properties).sort().map((field) => {
      const found = types.filter((entry) => entry._id.field === field);
      return { field, required: schema.required.includes(field), missing: total - found.reduce((sum, entry) => sum + entry.count, 0), types: Object.fromEntries(found.map((entry) => [entry._id.type, entry.count])) };
    });
    collections.push({ collection: name, total, invalidDocuments, fields, unexpectedFields: [...new Set(types.filter((entry) => !Object.hasOwn(schema.properties, entry._id.field)).map((entry) => entry._id.field))] });
  }
  const native = [];
  for (const name of nativeCollections) {
    const types = await database.collection(name).aggregate([{ $group: { _id: { $type: "$_id" }, count: { $sum: 1 } } }]).toArray();
    native.push({ collection: name, idTypes: Object.fromEntries(types.map((entry) => [entry._id, entry.count])) });
  }
  return {
    ready: issues.length === 0 && collections.every((entry) => entry.invalidDocuments === 0) && native.every((entry) => Object.keys(entry.idTypes).every((type) => type === "string")),
    storageHash: contract.storage.storageHash, collections, nativeCollections: native, indexIssues: issues,
  };
}

export function checkPlan(plan) {
  if (!Array.isArray(plan?.operations)) throw new Error("Missing migration operations");
  return plan.operations.filter((operation) => {
    // Permit only additive operations on declared managed collections. No
    // drop, conversion, replacement, or changes to an existing validator/index.
    const match = /^(validator|collection)\.([A-Za-z]+)\.(add|create)$/.exec(operation.id ?? "");
    return !match || managed[match[2]]?.control !== "managed" ||
      (match[1] === "validator"
        ? match[3] !== "add" || operation.operationClass !== "widening"
        : match[3] !== "create" || operation.operationClass !== "additive");
  }).map((operation) => ({ id: operation.id, operationClass: operation.operationClass }));
}

// Inspect only the current connection's effective privileges. Do not return
// database/user/role identities or assume cluster privileges grant data access.
export function checkManagementPermissions(authInfo, databaseName, operations) {
  if (!authInfo?.authenticatedUsers?.length || !Array.isArray(authInfo.authenticatedUserPrivileges)) return { checked: false, missing: [] };
  const required = operations.flatMap(({ id }) => {
    const match = /^(validator|collection)\.([A-Za-z]+)\.(add|create)$/.exec(id ?? "");
    return match ? [{ collection: match[2], action: match[1] === "validator" ? "collMod" : "createCollection" }] : [];
  });
  const missing = required.filter(({ collection, action }) => !authInfo.authenticatedUserPrivileges.some(({ resource, actions }) =>
    (actions.includes(action) || actions.includes("anyAction")) &&
    (resource.anyResource === true || ((resource.db === databaseName || resource.db === "") && (resource.collection === "" || resource.collection === collection))),
  ));
  return { checked: true, missing };
}

export async function runPrisma(args, url) {
  const state = await mkdtemp(join(tmpdir(), "bidlane-management-"));
  let stdout;
  try {
    ({ stdout } = await execute(process.execPath, ["node_modules/prisma/dist/prisma.js", ...args, "--config", "prisma.management.config.ts", "--json"], {
      cwd: root, env: { ...process.env, DATABASE_URL: url, BIDLANE_MANAGEMENT_STATE_DIR: state }, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    }));
  } catch { throw new Error("Prisma management command did not succeed"); }
  finally { await rm(state, { recursive: true, force: true }); }
  // The CLI emits NDJSON progress followed by a result envelope.
  const envelope = String(stdout ?? "").split("\n").flatMap((line) => {
    try { const entry = JSON.parse(line); return entry.kind === "result" ? [entry.envelope] : []; } catch { return []; }
  }).at(-1);
  if (!envelope?.ok || envelope.result?.ok === false) throw new Error("Prisma management command did not succeed");
  return envelope.result;
}

export async function manageDatabase(action, database, url) {
  if (!["plan", "apply"].includes(action)) throw new Error("Invalid management action");
  // The audit and CLI must inspect the same reviewed contract. Refuse stale
  // artifacts before planning or applying a source change with new validators.
  try {
    await execute(process.execPath, ["scripts/validate-contract.mjs"], { cwd: root, timeout: 35_000, maxBuffer: 1024 * 1024 });
  } catch { throw new Error("Contract artifacts are not validated"); }
  const audit = await auditDatabase(database);
  const result = await runPrisma(["db", "update", "--dry-run"], url);
  if (result.plan?.destination?.storageHash !== contract.storage.storageHash) throw new Error("Planned contract does not match the audit");
  const blockedOperations = checkPlan(result.plan);
  let permissions = { checked: false, missing: [] };
  try {
    const status = await database.command({ connectionStatus: 1, showPrivileges: true });
    permissions = checkManagementPermissions(status.authInfo, database.databaseName, result.plan.operations);
  } catch { /* Unavailable/unauthenticated privilege inventories stay explicit; MongoDB still enforces access. */ }
  const report = { ready: audit.ready && blockedOperations.length === 0 && permissions.missing.length === 0, audit, operations: result.plan.operations, blockedOperations, permissions, applied: false };
  if (action !== "apply" || !report.ready) return report;
  await runPrisma(["db", "update", "--yes"], url);
  await runPrisma(["db", "verify", "--schema-only"], url);
  await runPrisma(["db", "sign", "--no-advance-ref"], url);
  await runPrisma(["db", "verify"], url);
  return { ...report, applied: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    if (process.argv.length > 3) throw new Error("Invalid arguments");
    const action = process.argv[2] ?? "audit", url = process.env.DATABASE_URL ?? "";
    connection = createMongoConnection(url);
    const result = action === "audit" ? await auditDatabase(connection.database) : await manageDatabase(action, connection.database, url);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch (error) {
    // Only expose our own fixed messages; driver/CLI errors may contain secrets.
    const safeReasons = ["Invalid arguments", "Invalid management action", "Contract artifacts are not validated", "Planned contract does not match the audit", "Prisma management command did not succeed"];
    const reason = safeReasons.includes(error?.message) ? ` (${error.message})` : "";
    console.error(`Database management did not complete${reason}. Check the contract, database access, and audit/plan reports. No override flags are accepted.`);
    process.exitCode = 1;
  } finally { await connection?.mongoClient.close(); }
}
