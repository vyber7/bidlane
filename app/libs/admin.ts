import getCurrentUser from "@/app/actions/getCurrentUser";
import { ApiRequestError } from "./api-request";
import prisma from "./prismadb";
import { getNativeRepositories } from "./native-repositories";

// Deliberately read the database on each request. A JWT or client-supplied
// role must never preserve admin access after it has been revoked.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new ApiRequestError(401, "Please sign in to continue.");
  if (user.role !== "ADMIN") throw new ApiRequestError(403, "Admin access required.");
  return user;
}

// Every admin data entry point must authorize itself, including API handlers
// and Server Actions. A page/layout or proxy check alone is insufficient.
export async function getAdminOverview() {
  const user = await requireAdmin();
  const [users, listings, liveAuctions] = await Promise.all([
    getNativeRepositories().users.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "LIVE" } }),
  ]);
  return { admin: { id: user.id, name: user.name, email: user.email }, users, listings, liveAuctions };
}
