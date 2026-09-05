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
      <div className="mt-4 rounded-md bg-white p-8 text-center shadow-md">
        <h3 className="font-semibold">No auctions found</h3>
        <p className="mt-1 text-sm text-gray-600">
          Check back soon for newly listed vehicles.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid justify-items-center md:grid-cols-2 lg:grid-cols-3 gap-2  lg:gap-4 pt-4">
      {listings.map((listing) => (
        <li
          key={listing.id}
          className="bg-white rounded-md shadow-md shadow-gray-600  hover:ring hover:ring-gray-900"
        >
          <ListingBox listing={listing} currentUser={currentUser} />
        </li>
      ))}
    </ul>
  );
};

export default Listings;
