import prisma from "../libs/prismadb";

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
    console.error("Error fetching bids:", error);
    return [];
  }
};

export default getBids;
