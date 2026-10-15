import NotificationsCenter from "@/app/account/components/NotificationsCenter";
import { getAccountUser } from "@/app/account/lib/current-user";
import prisma from "@/app/libs/prismadb";
import { buildAccountNotifications } from "@/app/account/lib/notifications";

const Notifications = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const [bids, watchedListings, sellerListings] = await Promise.all([
    prisma.bid.findMany({
      where: { userId: currentUser.id },
      include: { listing: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { watchersIds: { has: currentUser.id } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { userId: currentUser.id },
      include: {
        comments: {
          where: { userId: { not: currentUser.id } },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <NotificationsCenter
      notifications={buildAccountNotifications({
        bids,
        watchedListings,
        sellerListings,
        userId: currentUser.id,
      })}
      userId={currentUser.id}
    />
  );
};

export default Notifications;
