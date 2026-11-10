import { pathToFileURL } from "node:url";
import { createMongoConnection } from "../prisma/v8/connection.mjs";

// Metadata only: no document reads, validators, indexes, or signatures changed.
export async function checkMongoV8(database) {
  const build = await database.command({ buildInfo: 1 });
  const topology = await database.command({ hello: 1 });
  const supportedVersion = Number(build.versionArray?.[0]) >= 8;
  const transactions = Boolean(topology.setName || topology.msg === "isdbgrid");
  return {
    version: build.version,
    supportedVersion,
    transactions,
    ready: supportedVersion && transactions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    connection = createMongoConnection(process.env.DATABASE_URL ?? "");
    const result = await checkMongoV8(connection.database);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch {
    // Driver errors may include credentials or hostnames.
    console.error("Unable to check MongoDB readiness. Check DATABASE_URL, network access, and metadata permissions.");
    process.exitCode = 1;
  } finally {
    await connection?.mongoClient.close();
  }
}
