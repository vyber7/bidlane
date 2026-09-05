"use client";

import { Listing, User } from "@prisma/client";
import React from "react";
import AccountListingBox from "./AccountListingBox";

interface UploadedListingsProps {
  listings: Listing[];
  currentUser: User | null;
}

const UploadedListings: React.FC<UploadedListingsProps> = ({
  listings,
  currentUser,
}) => {
  return (
    <>
      <h2 className="text-xl font-bold bg-gray-900 text-white p-2 rounded-t-md">
        Uploaded
      </h2>
      <ul className="flex flex-col gap-4 py-4">
        {listings.length === 0 && (
          <li className="rounded-md bg-white p-6 text-center text-gray-600 shadow-md">
            You have not submitted any vehicles yet.
          </li>
        )}
        {listings?.map((listing) => (
          <li
            key={listing.id}
            className="rounded-md shadow-md w-full shadow-gray-400"
          >
            <AccountListingBox
              listing={listing}
              currentUser={currentUser}
              watching={
                listing.watchersIds.includes(currentUser?.id as string)
                  ? true
                  : false
              }
              uploaded={listing.userId === currentUser?.id}
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export default UploadedListings;
