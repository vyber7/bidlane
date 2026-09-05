"use client";

import Image from "next/image";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import Title from "./Title";
import { useState } from "react";
import { GrEdit } from "react-icons/gr";
import { FaRegClock } from "react-icons/fa";
import { Listing, User } from "@prisma/client";
import useCountDown from "../hooks/useCountDown";
import { formatAmount, canEndAuction } from "../utils/format";
import { clsx } from "clsx";
import { CldImage } from "next-cloudinary";
import usePusherEvent from "../hooks/usePusherEvent";
import useWatchlist from "../hooks/useWatchlist";

interface ListingBoxProps {
  listing: Listing;
  currentUser?: User | null;
}

const ListingBox: React.FC<ListingBoxProps> = ({ listing, currentUser }) => {
  const [bid, setBid] = useState<number | null>(listing.currentBid);
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUser?.id,
    initialWatching: listing.watchersIds.includes(currentUser?.id as string),
  });

  const timeLeft = useCountDown(listing.auctionEndsAt as Date, listing.id);

  usePusherEvent<{ amount: number }>(
    `listing-${listing.id}`,
    "new-bid",
    (newBid) => setBid(newBid.amount)
  );

  //   const distance = endTime.getTime() - now.getTime();
  //   if (distance <= 0) {
  //     return "Ended";
  //   }

  //   const weeks = Math.floor(distance / (1000 * 60 * 60 * 24 * 7));

  //   const days = Math.floor(distance / (1000 * 60 * 60 * 24));

  //   const hours = Math.floor(
  //     (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
  //   );
  //   const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

  //   const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  //   if (weeks >= 1 && weeks < 2) {
  //     return `${weeks} Week ${days % 7} Days `;
  //   }

  //   if (days > 1) {
  //     return `${days} Days`;
  //   }

  //   return `${hours}h ${minutes}m ${seconds}s`;
  // };
  return (
    <div className="flex flex-wrap justify-between transition-all">
      <Link className="" href={`/listing/${listing.id}`}>
        <Title year={listing.year} make={listing.make} model={listing.model} />
      </Link>
      {listing.userId == currentUser?.id ? (
        <button className="flex items-center text-sm px-2">
          <GrEdit />
        </button>
      ) : (
        <button
          className="flex items-center text-xl px-2"
          onClick={toggle}
          disabled={isUpdating}
          aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
        >
          {watching ? (
            <GoStarFill className="text-yellow-500" />
          ) : (
            <GoStar className="text-yellow-500" />
          )}
        </button>
      )}

      <div className="flex flex-col w-full">
        <Link className="w-full" href={`/listing/${listing.id}`}>
          {listing.coverImage && (
            <CldImage
              src={listing.coverImage}
              width={400}
              height={250}
              alt="listing Image"
              className="w-full object-cover"
              priority={true}
              crop="fill"
            />
          )}
          {!listing.coverImage && (
            <Image
              src="/images/default-vehicle-image.png"
              alt="listing Image"
              width={400}
              height={250}
              className="w-full rounded-t object-cover lg:rounded-t-none lg:rounded-tl"
              priority={true}
            />
          )}
        </Link>
        <div className="flex justify-between p-2 bg-gray-900 text-white text-sm">
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
      <div className="text-sm p-2 pt-0">
        6-Speed Manual, V12 Power, California-Owned, Some Modifications
        <span className="block text-gray-500">{listing.location}</span>
      </div>
      {/* <div className="relative px-3 pb-8 lg:w-1/2">
        <p className="relative h-48 overflow-hidden after:absolute after:bottom-0 after:left-0 after:h-20 after:w-full after:bg-gradient-to-t after:from-white ">
          {description}
        </p>
        <button
          onClick={() => router.push(`/listing/${id}`)}
          className="z-1 absolute bottom-2 p-2 right-1/2 translate-x-1/2 rounded text-sm font-bold transition hover:bg-gray-100"
        >
          Read more...
        </button>
      </div> */}
    </div>
  );
};

export default ListingBox;
