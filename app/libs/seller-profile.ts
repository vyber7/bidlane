import prisma from "./prismadb";

const vehicleSelect = {
  id: true, year: true, make: true, model: true, location: true,
  status: true, currentBid: true, coverImage: true, auctionEndsAt: true,
} as const;

export async function getSellerProfile(id: string, page = 1) {
  const seller = await prisma.user.findUnique({
    where: { id }, select: { id: true, name: true, image: true, createdAt: true, emailVerified: true },
  });
  if (!seller) return null;
  const soldWhere = { userId: id, status: "ENDED", result: "SOLD" };
  const [salesCount, active, sales] = await Promise.all([
    prisma.listing.count({ where: soldWhere }),
    prisma.listing.findMany({ where: { userId: id, status: { in: ["LIVE", "UPCOMING"] } }, select: vehicleSelect, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.listing.findMany({ where: soldWhere, select: vehicleSelect, orderBy: [{ auctionEndsAt: "desc" }, { id: "desc" }], skip: (page - 1) * 12, take: 12 }),
  ]);
  // Only the boolean is public; never expose the email or verification timestamp.
  const { emailVerified, ...publicSeller } = seller;
  return { seller: { ...publicSeller, emailVerified: Boolean(emailVerified) }, salesCount, active, sales };
}
