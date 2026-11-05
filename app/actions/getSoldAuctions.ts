import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { toPublicListing } from "@/app/libs/listing-payload";

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
    return soldAuctions.map((listing) => toPublicListing(listing));
  } catch (error) {
    logger.error("auctions.sold_fetch_failed", error);
    return [];
  }
}
export default getSoldAuctions;
