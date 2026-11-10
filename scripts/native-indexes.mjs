import { createMongoConnection } from "../prisma/v8/connection.mjs";
import { checkNativeIndexes, ensureNativeIndexes } from "../prisma/native/indexes.mjs";

const action = process.argv[2] ?? "check";
let connection;
try {
  if (process.argv.length > 3 || !["check", "apply"].includes(action)) throw new Error("usage");
  connection = createMongoConnection(process.env.DATABASE_URL ?? "");
  if (action === "apply") await ensureNativeIndexes(connection.database);
  const issues = await checkNativeIndexes(connection.database);
  console.log(JSON.stringify({ ready: issues.length === 0, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch {
  console.error("Unable to verify native indexes. Use: npm run db:native:indexes -- [check|apply]. Check database access and index definitions.");
  process.exitCode = 1;
} finally {
  await connection?.mongoClient.close();
}
