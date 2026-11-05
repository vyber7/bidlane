import ListingDrafts from "@/app/account/components/ListingDrafts";
import { serializeDraft } from "@/app/libs/listing-drafts";
import ListingsDashboard from "@/app/account/components/ListingsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import prisma from "@/app/libs/prismadb";
import { publicListingWhere } from "@/app/libs/listing-review";
import { toPublicListing, toSellerListing } from "@/app/libs/listing-payload";

const MyListings = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const [uploaded, watching, drafts] = await Promise.all([
    prisma.listing.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: { watchersIds: { has: currentUser.id }, AND: [publicListingWhere] },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.listingDraft.findMany({ where: { userId: currentUser.id, publishedListingId: null, deletedAt: null }, orderBy: { updatedAt: "desc" } }),
  ]);

  return (
    <div>
      <ListingDrafts drafts={drafts.map((draft) => {
        const saved = serializeDraft(draft);
        return { id: saved.id, revision: saved.revision, title: [saved.payload.details.year, saved.payload.details.make, saved.payload.details.model].filter(Boolean).join(" ") || "Untitled vehicle", photoCount: saved.payload.images.length, updatedAt: saved.updatedAt };
      })} />
      <ListingsDashboard
        uploaded={uploaded.map((listing) => toSellerListing(listing, currentUser))}
        initialWatching={watching.map((listing) => toPublicListing(listing, currentUser.id))}
        currentUserId={currentUser.id}
      />
    </div>
  );
};

export default MyListings;
