// This file will contain the logic to fetch sold auctions
import prisma from "@/app/libs/prismadb";
import { logger } from "@/app/libs/logger";

async function getSoldAuctions() {
  try {
    const soldAuctions = await prisma.listing.findMany({
      where: {
        result: "SOLD",
      },
    });
    return soldAuctions;
  } catch (error) {
    logger.error("auctions.sold_fetch_failed", error);
    return [];
  }
}
export default getSoldAuctions;
