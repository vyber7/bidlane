import AccountLinks from "@/app/account/components/AccountLinks";
import prisma from "../../libs/prismadb";
import getCurrentUser from "@/app/actions/getCurrentUser";
import AccountHeader from "@/app/account/components/AccountHeader";
import UploadedListings from "@/app/account/components/UploadedListings";
import WatchingListings from "@/app/account/components/WatchingListings";

export const dynamic = "force-dynamic";

const MyListings = async () => {
  const currentUser = await getCurrentUser();
  const uploaded = await prisma.listing.findMany({
    where: {
      userId: currentUser?.id,
    },
  });
  const watching = await prisma.listing.findMany({
    where: {
      watchersIds: {
        has: currentUser?.id,
      },
    },
  });

  return (
    <>
      <div className="m-auto max-w-5xl grid grid-cols-4 gap-4 pb-4 px-2 lg:px-0">
        <AccountHeader userName={currentUser?.name?.split(" ")[0]} />
        <AccountLinks />
        <div className="lg:col-span-3 col-span-4">
          <UploadedListings listings={uploaded} currentUser={currentUser} />
          <WatchingListings
            initialListings={watching}
            currentUser={currentUser}
          />
        </div>
      </div>
    </>
  );
};

export default MyListings;
