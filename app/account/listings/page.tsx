import ListingsDashboard from "@/app/account/components/ListingsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import prisma from "@/app/libs/prismadb";

const MyListings = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const [uploaded, watching] = await Promise.all([
    prisma.listing.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { watchersIds: { has: currentUser.id } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <ListingsDashboard
      uploaded={uploaded}
      initialWatching={watching}
      currentUserId={currentUser.id}
    />
  );
};

export default MyListings;
