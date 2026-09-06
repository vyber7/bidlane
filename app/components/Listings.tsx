"use client";
import { Listing, User } from "@prisma/client";
import ListingBox from "./ListingBox";

interface ListingsProps {
  listings: Listing[];
  currentUser: User | null;
}

const Listings: React.FC<ListingsProps> = ({ listings, currentUser }) => {
  if (listings.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <h3 className="font-semibold">No auctions found</h3>
        <p className="mt-1 text-sm text-gray-600">
          Check back soon for newly listed vehicles.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-5 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <li
          key={listing.id}
          className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/10"
        >
          <ListingBox listing={listing} currentUser={currentUser} />
        </li>
      ))}
    </ul>
  );
};

export default Listings;
