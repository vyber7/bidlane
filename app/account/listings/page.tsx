import ListingDrafts from "@/app/account/components/ListingDrafts";
import { serializeDraft } from "@/app/libs/listing-drafts";
import ListingsDashboard from "@/app/account/components/ListingsDashboard";
import { getAccountUser } from "@/app/account/lib/current-user";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import { getReadRepositories } from "@/app/libs/read-repositories";
import { toSellerListing } from "@/app/libs/listing-payload";

const MyListings = async () => {
  const currentUser = await getAccountUser();
  if (!currentUser) return null;

  const [uploaded, watching, drafts] = await Promise.all([
    getReadRepositories().listings.owned(currentUser.id),
    getNativeRepositories().engagement.watchlist(currentUser.id),
    getNativeRepositories().drafts.list(currentUser.id),
  ]);

  return (
    <div>
      <ListingDrafts drafts={drafts.map((draft) => {
        const saved = serializeDraft(draft);
        return { id: saved.id, revision: saved.revision, title: [saved.payload.details.year, saved.payload.details.make, saved.payload.details.model].filter(Boolean).join(" ") || "Untitled vehicle", photoCount: saved.payload.images.length, updatedAt: saved.updatedAt };
      })} />
      <ListingsDashboard
        uploaded={uploaded.map((listing) => toSellerListing(listing, currentUser))}
        initialWatching={watching}
        currentUserId={currentUser.id}
      />
    </div>
  );
};

export default MyListings;
