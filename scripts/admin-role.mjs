import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

// Keep this entry point outside the application: only a trusted operator with
// database access can grant or revoke roles. Email matching is exact, just as
// it is for sign-in; never accidentally target a differently cased account.
export async function changeAdminRole(args, prisma) {
  const [action, rawEmail, ...extra] = args;
  const email = rawEmail?.trim();
  if (!["grant", "revoke"].includes(action) || !email || extra.length) {
    throw new Error("Usage: npm run admin:grant -- <existing-account-email> (or admin:revoke)");
  }

  const role = action === "grant" ? "ADMIN" : "USER";
  try {
    return await prisma.user.update({
      where: { email },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  } catch (error) {
    if (error.code === "P2025") {
      throw new Error("Account not found. Register or sign in with OAuth first, then use the exact account email.");
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  try {
    const user = await changeAdminRole(process.argv.slice(2), prisma);
    console.log(`${user.email} (${user.id}) now has role ${user.role}.`);
  } catch (error) {
    // Prisma errors can contain connection details; do not print them.
    console.error(error.message.startsWith("Usage:") || error.message.startsWith("Account not found.")
      ? error.message
      : "Unable to change admin access. Check database configuration and regenerate the Prisma client.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
