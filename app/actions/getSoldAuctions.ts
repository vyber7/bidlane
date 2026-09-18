import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";

async function getSoldAuctions() {
  try {
    const soldAuctions = await prisma.listing.findMany({
      where: {
        status: "ENDED",
        result: "SOLD",
        currentBid: { not: null },
      },
      orderBy: { auctionEndsAt: "desc" },
      take: 4,
    });
    return soldAuctions;
  } catch (error) {
    logger.error("auctions.sold_fetch_failed", error);
    return [];
  }
}
export default getSoldAuctions;
