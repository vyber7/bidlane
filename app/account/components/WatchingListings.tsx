"use client";
import { Listing, User } from "@prisma/client";
import { useState } from "react";
import AccountListingBox from "./AccountListingBox";
import usePusherEvent from "@/app/hooks/usePusherEvent";

interface WatchingUpdate {
  listing: Listing;
  watching: boolean;
}

interface WatchingListingsProps {
  initialListings: Listing[];
  currentUser: User | null;
}

const WatchingListings: React.FC<WatchingListingsProps> = ({
  initialListings,
  currentUser,
}) => {
  const [watchingListings, setWatchingListings] =
    useState<Listing[]>(initialListings);
  usePusherEvent<WatchingUpdate>(
    currentUser?.id ? `user-${currentUser.id}-watching` : null,
    "watching-update",
    ({ listing, watching }) => {
      setWatchingListings((current) => {
        if (!watching) {
          return current.filter((item) => item.id !== listing.id);
        }
        if (current.some((item) => item.id === listing.id)) return current;
        return [listing, ...current];
      });
    }
  );
  return (
    <>
      <h2 className="text-xl font-bold bg-gray-900 rounded-t-md text-white p-2">
        Watching
      </h2>
      <ul className="flex flex-col gap-4 pt-4">
        {watchingListings.length === 0 && (
          <li className="rounded-md bg-white p-6 text-center text-gray-600 shadow-md">
            You are not watching any auctions yet.
          </li>
        )}
        {watchingListings.map((listing) => (
          <li key={listing.id} className="rounded-md shadow-md shadow-gray-400">
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

export default WatchingListings;
