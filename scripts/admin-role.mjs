import { createMongoConnection } from "../prisma/v8/connection.mjs";
import { pathToFileURL } from "node:url";

// Keep this entry point outside the application: only a trusted operator with
// database access can grant or revoke roles. Email matching stays exact so an
// operator never accidentally targets a differently cased legacy account.
export async function changeAdminRole(args, database) {
  const [action, rawEmail, ...extra] = args;
  const email = rawEmail?.trim();
  if (!["grant", "revoke"].includes(action) || !email || extra.length) {
    throw new Error("Usage: npm run admin:grant -- <existing-account-email> (or admin:revoke)");
  }

  const role = action === "grant" ? "ADMIN" : "USER";
  const user = await database.collection("User").findOneAndUpdate(
    { email }, { $set: { role, updatedAt: new Date() } },
    { returnDocument: "after", projection: { _id: 1, email: 1, role: 1 } },
  );
  if (!user) throw new Error("Account not found. Register or sign in with OAuth first, then use the exact account email.");
  return { id: user._id.toHexString(), email: user.email, role: user.role };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    connection = createMongoConnection(process.env.DATABASE_URL);
    const user = await changeAdminRole(process.argv.slice(2), connection.database);
    console.log(`${user.email} (${user.id}) now has role ${user.role}.`);
  } catch (error) {
    // Driver errors can contain connection details; do not print them.
    console.error(error.message.startsWith("Usage:") || error.message.startsWith("Account not found.")
      ? error.message
      : "Unable to change admin access. Check database configuration.");
    process.exitCode = 1;
  } finally {
    await connection?.mongoClient.close();
  }
}
