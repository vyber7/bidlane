import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";
import { toPublicListing } from "@/app/libs/listing-payload";

async function getLiveAuctions() {
  try {
    const liveAuctions = await prisma.listing.findMany({
      where: {
        status: "LIVE",
      },
    });
    return liveAuctions.map((listing) => toPublicListing(listing));
  } catch (error) {
    logger.error("auctions.live_fetch_failed", error);
    return [];
  }
}
export default getLiveAuctions;
