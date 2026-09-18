import prisma from "../libs/prismadb";
import { logger } from "../libs/logger";

const getBids = async (listingId: string) => {
  try {
    const bids = await prisma.bid.findMany({
      where: {
        listingId: listingId,
      },
      orderBy: {
        amount: "desc",
      },
      include: {
        user: { select: { name: true } },
      },
    });

    return bids;
  } catch (error: unknown) {
    logger.error("bids.fetch_failed", error, { listingId });
    return [];
  }
};

export default getBids;
