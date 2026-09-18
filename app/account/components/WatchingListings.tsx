"use client";
import { Listing } from "@prisma/client";
import { useState } from "react";
import AccountListingBox from "./AccountListingBox";
import usePusherEvent from "@/app/hooks/usePusherEvent";

interface WatchingUpdate {
  listing: Listing;
  watching: boolean;
}

interface WatchingListingsProps {
  initialListings: Listing[];
  currentUserId?: string | null;
}

const WatchingListings: React.FC<WatchingListingsProps> = ({
  initialListings,
  currentUserId,
}) => {
  const [watchingListings, setWatchingListings] =
    useState<Listing[]>(initialListings);
  usePusherEvent<WatchingUpdate>(
    currentUserId ? `user-${currentUserId}-watching` : null,
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
      <h2 className="text-xl font-bold bg-slate-800 rounded-t-md text-white p-2">
        Watching
      </h2>
      <ul className="flex flex-col gap-4 pt-4">
        {watchingListings.length === 0 && (
          <li className="rounded-md bg-white p-6 text-center text-gray-600 shadow-md">
            You are not watching any auctions yet.
          </li>
        )}
        {watchingListings.map((listing) => (
          <li
            key={listing.id}
            className="w-full md:w-[49.5%] lg:w-[48.5%] rounded-md shadow-md shadow-gray-400"
          >
            <AccountListingBox
              listing={listing}
              currentUserId={currentUserId}
              watching={
                listing.watchersIds.includes(currentUserId as string)
                  ? true
                  : false
              }
              uploaded={listing.userId === currentUserId}
            />
          </li>
        ))}
      </ul>
    </>
  );
};

export default WatchingListings;
