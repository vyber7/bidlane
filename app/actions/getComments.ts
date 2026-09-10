import prisma from "../libs/prismadb";
import { logger } from "../libs/logger";

async function getComments(listingId: string) {
  try {
    if (!listingId) {
      throw new Error("Listing ID is required");
    }

    const comments = await prisma.comment.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        image: true,
        createdAt: true,
        listingId: true,
        user: { select: { name: true } },
      },
    });

    return comments;
  } catch (error) {
    logger.error("comments.fetch_failed", error, { listingId });
    return [];
  }
}

export default getComments;
