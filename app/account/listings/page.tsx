import AccountLinks from "@/app/account/components/AccountLinks";
import prisma from "../../libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountHeader from "@/app/account/components/AccountHeader";
import ListingsDashboard from "@/app/account/components/ListingsDashboard";

export const dynamic = "force-dynamic";

const MyListings = async () => {
  const currentUser = await getCurrentUser();
  const [uploaded, watching] = currentUser
    ? await Promise.all([
        prisma.listing.findMany({
          where: { userId: currentUser.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.listing.findMany({
          where: { watchersIds: { has: currentUser.id } },
          orderBy: { updatedAt: "desc" },
        }),
      ])
    : [[], []];

  return (
    <>
      <div className="m-auto max-w-5xl grid grid-cols-4 gap-4 pb-4 px-2 lg:px-0">
        <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
        <AccountLinks />
        <div className="col-span-4 lg:col-span-3">
          <ListingsDashboard
            uploaded={uploaded}
            initialWatching={watching}
            currentUserId={currentUser?.id}
          />
        </div>
      </div>
    </>
  );
};

export default MyListings;
