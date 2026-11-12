import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { BSON, Long } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import mongo from "@prisma/orm-mongo/runtime";
import { contractFromJson } from "@prisma/orm-mongo/static";
import contract from "../prisma/v8/contract.json" with { type: "json" };
import { createMongoConnection } from "../prisma/v8/connection.mjs";
import { applyUserDefaults, planUserDefaults, userDefaults } from "./backfill-user-defaults.mjs";
import { manageDatabase } from "./prisma-management.mjs";
import { rehearsalUrl } from "./prisma-rehearsal.mjs";

const execute = promisify(execFile);
const managedNames = Object.keys(contract.storage.namespaces.__unbound__.entries.collection);
const same = (left, right) => assert.deepStrictEqual(left, right);

function checkLocalOptions(parsed) {
  if (parsed.username || parsed.password) throw new Error("Rehearsal destination must be an unauthenticated loopback test server");
  for (const key of parsed.searchParams.keys()) {
    if (!["replicaSet", "directConnection"].includes(key)) throw new Error("Unsupported local connection option");
  }
}

export function copyRehearsalUrl(base) {
  const parsed = new ConnectionString(rehearsalUrl(base));
  // Never let a proxy or replica-set discovery redirect local writes elsewhere.
  checkLocalOptions(parsed);
  parsed.searchParams.set("directConnection", "true");
  return parsed.toString();
}

export function restoreArguments(sourceName, targetUrl, archive) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sourceName)) throw new Error("Unsupported source namespace");
  const parsed = new ConnectionString(targetUrl);
  checkLocalOptions(parsed);
  if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_migration_[a-z0-9_]+$/.test(parsed.pathname) || parsed.searchParams.get("directConnection") !== "true") throw new Error("Restore requires an isolated loopback database");
  const destination = parsed.pathname.slice(1);
  parsed.pathname = "/";
  return ["--uri", parsed.toString(), `--archive=${archive}`, "--gzip", `--nsInclude=${sourceName}.*`, `--nsFrom=${sourceName}.*`, `--nsTo=${destination}.*`, "--stopOnError", "--numParallelCollections=1"];
}

// Raw BSON preserves int32/int64/double distinctions and binary values. A read-
// only snapshot spans all collections; metadata must also remain stable.
export async function snapshotDatabase(database, mongoClient) {
  const describe = async () => {
    const collections = (await database.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const result = {};
    for (const entry of collections) {
      if (entry.type !== "collection" || entry.options?.timeseries) throw new Error("Copy rehearsal only supports ordinary collections");
      result[entry.name] = { options: entry.options, uuid: entry.info?.uuid, indexes: (await database.collection(entry.name).indexes()).sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return result;
  };
  const metadata = await describe();
  const collections = await mongoClient.withSession((session) => session.withTransaction(async () => {
    const result = {};
    for (const [name, { options, indexes }] of Object.entries(metadata)) {
      const hash = createHash("sha256"), expected = createHash("sha256"); let documents = 0;
      for await (const raw of database.collection(name).find({}, { session, raw: true, sort: { _id: 1 } })) {
        if (!Buffer.isBuffer(raw)) throw new Error("Raw BSON unavailable");
        hash.update(raw); documents++;
        if (name === "User") {
          const document = BSON.deserialize(raw, { promoteValues: false });
          for (const [field, value] of Object.entries(userDefaults)) if (!Object.hasOwn(document, field)) document[field] = value;
          expected.update(BSON.serialize(document));
        } else expected.update(raw);
      }
      result[name] = { documents, hash: hash.digest("hex"), afterDefaultsHash: expected.digest("hex"), options, indexes };
    }
    return result;
  }, { readConcern: { level: "snapshot" }, readPreference: "primary", timeoutMS: 30_000 }));
  same(await describe(), metadata);
  return collections;
}

async function smoke(database, mongoClient) {
  const db = mongo({ contract: contractFromJson(contract), mongoClient, dbName: database.databaseName });
  const reads = {};
  try {
    for (const name of managedNames) reads[name] = (await db.orm[name].all()).length;
  } finally { await db.close(); }
  // Verify actual restored records support a session-bound write and rollback,
  // and that native string keys remain writable without persistent changes.
  const rollback = new Error("Expected rehearsal rollback");
  try {
    await mongoClient.withSession((session) => session.withTransaction(async () => {
      const user = await database.collection("User").findOne({}, { session, projection: { endingSoonEmailsEnabled: 1 } });
      if (user) {
        const result = await database.collection("User").updateOne({ _id: user._id }, { $set: { endingSoonEmailsEnabled: !user.endingSoonEmailsEnabled } }, { session });
        same(result.modifiedCount, 1);
      }
      await database.collection("AbuseQuota").insertOne({ _id: `rehearsal:${database.databaseName}`, count: Long.ONE, expiresAt: new Date() }, { session });
      throw rollback;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, timeoutMS: 5_000 }));
  } catch (error) { if (error !== rollback) throw error; }
  await assert.rejects(database.collection("User").insertOne({}), (error) => error.code === 121);
  return reads;
}

export async function rehearseDatabaseCopy({ sourceUrl, localUrl, backupRoot = join(homedir(), ".local/state/bidlane/backups"), dumpBinary = "mongodump", restoreBinary = "mongorestore" }) {
  const targetUrl = copyRehearsalUrl(localUrl);
  const source = createMongoConnection(sourceUrl), target = createMongoConnection(targetUrl);
  // Do not read or write before namespace and destination validation succeeds.
  restoreArguments(source.database.databaseName, targetUrl, "placeholder");
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(backupRoot, "prisma8-"));
  const archive = join(directory, "database.archive.gz"), config = join(directory, "source.yml");
  let ownsTarget = false, phase = "backup";
  const privateJson = (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  const command = async (binary, arguments_, name) => {
    try {
      const result = await execute(binary, arguments_, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
      await writeFile(join(directory, `${name}.log`), result.stdout + result.stderr, { mode: 0o600, flag: "wx" });
    } catch (error) {
      await writeFile(join(directory, `${name}.log`), String(error.stdout ?? "") + String(error.stderr ?? ""), { mode: 0o600, flag: "wx" });
      throw new Error(`${name} command failed`);
    }
  };
  try {
    await source.mongoClient.connect(); await target.mongoClient.connect();
    same(await target.database.listCollections().toArray(), []); ownsTarget = true;
    const before = await snapshotDatabase(source.database, source.mongoClient);
    await privateJson("snapshot.json", before);
    await writeFile(config, `uri: ${JSON.stringify(sourceUrl)}\n`, { mode: 0o600, flag: "wx" });
    try { await command(dumpBinary, ["--config", config, `--archive=${archive}`, "--gzip", "--numParallelCollections=1"], "dump"); }
    finally { await rm(config, { force: true }); }
    await chmod(archive, 0o600);
    // A per-database dump has no oplog replay. Accept it only when it matches
    // stable source snapshots on both sides of the dump AND the restored BSON.
    same(await snapshotDatabase(source.database, source.mongoClient), before);
    const archiveDigest = createHash("sha256");
    for await (const chunk of createReadStream(archive)) archiveDigest.update(chunk);
    const archiveHash = archiveDigest.digest("hex");
    phase = "restore";
    await command(restoreBinary, restoreArguments(source.database.databaseName, targetUrl, archive), "restore");
    same(await snapshotDatabase(target.database, target.mongoClient), before);
    phase = "backfill";
    const preview = await planUserDefaults(target.database); same(preview.ready, true);
    const backfill = await applyUserDefaults(target.database, target.mongoClient); same(backfill.mode, "applied");
    const repaired = await snapshotDatabase(target.database, target.mongoClient);
    const expected = Object.fromEntries(Object.entries(before).map(([name, entry]) => [name, { ...entry, hash: entry.afterDefaultsHash }]));
    same(repaired, expected);
    phase = "adoption";
    const adoption = await manageDatabase("apply", target.database, targetUrl); same(adoption.applied, true);
    const adopted = await snapshotDatabase(target.database, target.mongoClient);
    for (const [name, entry] of Object.entries(repaired)) {
      same(adopted[name].hash, entry.hash); same(adopted[name].indexes, entry.indexes);
      if (!managedNames.includes(name)) same(adopted[name].options, entry.options);
    }
    const repeated = await manageDatabase("plan", target.database, targetUrl); same(repeated.ready, true); same(repeated.operations, []);
    phase = "smoke";
    const reads = await smoke(target.database, target.mongoClient);
    for (const name of managedNames) same(reads[name], repaired[name].documents);
    same(await snapshotDatabase(target.database, target.mongoClient), adopted);
    const report = { ready: true, sourceWrites: false, archiveHash, collections: Object.keys(before).length, documents: Object.values(before).reduce((sum, entry) => sum + entry.documents, 0), backfill: { documents: backfill.modifiedDocuments, fields: backfill.fieldsToAdd }, storageHash: adoption.audit.storageHash, operations: adoption.operations.map(({ id }) => id), repeatedOperations: repeated.operations.length, ormReads: reads, preservation: true, rollback: true, validatorsEnforced: true };
    await privateJson("report.json", report);
    return { ...report, backupDirectory: directory };
  } catch (error) {
    await writeFile(join(directory, "failure.log"), String(error.stack ?? error), { mode: 0o600 });
    throw new Error(`Copy rehearsal failed during ${phase}; inspect private backup directory ${directory}`);
  } finally {
    try { if (ownsTarget) await target.database.dropDatabase(); }
    finally { await Promise.all([source.mongoClient.close(), target.mongoClient.close()]); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error("No arguments accepted");
    console.log(JSON.stringify(await rehearseDatabaseCopy({ sourceUrl: process.env.DATABASE_URL ?? "", localUrl: process.env.MIGRATION_TEST_DATABASE_URL ?? "", backupRoot: process.env.BIDLANE_BACKUP_ROOT, dumpBinary: process.env.MONGODUMP_BIN, restoreBinary: process.env.MONGORESTORE_BIN }), null, 2));
  } catch (error) {
    console.error(error.message.startsWith("Copy rehearsal failed during ") ? error.message : "Copy rehearsal refused or could not start. Check the loopback test URL, database access, tools, and backup directory.");
    process.exitCode = 1;
  }
}
