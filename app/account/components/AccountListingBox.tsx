"use client";

import Link from "next/link";
import { GoTrash } from "react-icons/go";
import { GrEdit } from "react-icons/gr";
import Image from "next/image";
import Title from "../../components/Title";
import { Listing, User } from "@prisma/client";
import { formatAmount, canEndAuction } from "@/app/utils/format";
import clsx from "clsx";
import { FaRegClock } from "react-icons/fa";
import useCountDown from "@/app/hooks/useCountDown";
import { useState } from "react";
import { CldImage } from "next-cloudinary";
import useWatchlist from "@/app/hooks/useWatchlist";

interface AccountListingBoxProps {
  listing: Listing;
  currentUser: User | null;
  watching: boolean;
  uploaded: boolean;
}

const AccountListingBox: React.FC<AccountListingBoxProps> = ({
  listing,
  currentUser,
  watching,
  uploaded,
}) => {
  const [bid] = useState<number | null>(listing.currentBid);
  const { isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUser?.id,
    initialWatching: watching,
  });

  const timeLeft = useCountDown(listing.auctionEndsAt as Date, listing.id);

  return (
    <div className="flex flex-wrap justify-start bg-white rounded-md shadow-md shadow-gray-400 transition-all hover:ring hover:ring-gray-900">
      <div className="flex flex-col w-1/2 md:w-1/4">
        <Link className="w-full" href={`/listing/${listing.id}`}>
          {listing.coverImage ? (
            <CldImage
              src={listing.coverImage}
              alt="listing Image"
              width={250}
              height={150}
              className="w-full object-cover rounded-tl-md"
              priority={true}
              crop="fill"
            />
          ) : (
            <Image
              src="/images/default-vehicle-image.png"
              alt="listing Image"
              width={250}
              height={150}
              className="w-full object-cover rounded-tl-md"
              priority={true}
            />
          )}
        </Link>

        <div className="flex justify-between p-2 bg-gray-900 text-white text-xs rounded-bl-md">
          {listing.status === "UPCOMING" ? (
            <div>Upcoming</div>
          ) : listing.status === "ENDED" ? (
            <div>
              {listing.result === "SOLD" ? (
                <span>
                  Sold for <b>${formatAmount(bid as number)}</b>
                </span>
              ) : bid ? (
                <span>
                  Bid to <b>${formatAmount(bid as number)}</b>
                </span>
              ) : (
                <span>No bids were placed</span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <FaRegClock />{" "}
                <span
                  className={clsx(
                    canEndAuction(timeLeft) ? "text-red-600" : ""
                  )}
                >
                  {timeLeft}
                </span>
              </div>
              {bid ? (
                <span>
                  Bid <b>${formatAmount(bid)}</b>
                </span>
              ) : (
                <span>
                  Starting at{" "}
                  <b>${formatAmount(listing.startingBid as number)}</b>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col w-1/2 md:w-3/4">
        <div className="flex justify-between">
          <Link className="" href={`/listing/${listing.id}`}>
            <Title
              year={listing.year}
              make={listing.make}
              model={listing.model}
            />
          </Link>
          {uploaded ? (
            <button className="flex items-center text-sm px-2">
              <GrEdit />
            </button>
          ) : (
            <button
              className="flex items-center text-sm px-2"
              onClick={toggle}
              disabled={isUpdating}
              aria-label="Remove from watchlist"
            >
              <GoTrash className="text-red-500" />
            </button>
          )}
        </div>
        <div className="text-xs md:text-sm p-2 pt-0">
          6-Speed Manual, V12 Power, California-Owned, Some Modifications
          <span className="block text-gray-500">Santa Cruz, CA 95060</span>
        </div>
      </div>
    </div>
  );
};

export default AccountListingBox;
