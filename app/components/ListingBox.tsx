"use client";

import Image from "next/image";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import Title from "./Title";
import { GrEdit } from "react-icons/gr";
import { FaRegClock } from "react-icons/fa";
import { Listing } from "@prisma/client";
import useAuction from "../hooks/useAuction";
import { formatAmount } from "../utils/format";
import { clsx } from "clsx";
import { CldImage } from "next-cloudinary";
import useWatchlist from "../hooks/useWatchlist";

interface ListingBoxProps {
  listing: Listing;
  currentUserId?: string | null;
}

const ListingBox: React.FC<ListingBoxProps> = ({ listing: initialListing, currentUserId }) => {
  const { listing, remainingMs, timeLeft } = useAuction(initialListing);
  const bid = listing.currentBid;
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUserId,
    initialWatching: Boolean(currentUserId && listing.watchersIds.includes(currentUserId)),
  });

  return (
    <div className="flex h-full flex-wrap justify-between transition-all">
      <Link className="min-w-0 flex-1" href={`/listing/${listing.id}`}>
        <Title year={listing.year} make={listing.make} model={listing.model} />
      </Link>
      {listing.userId == currentUserId ? (
        <button className="flex items-center text-sm px-2">
          <GrEdit />
        </button>
      ) : (
        <button
          className="flex items-center px-3 text-xl transition hover:scale-110"
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
              className="aspect-[16/10] w-full object-cover"
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
              className="aspect-[16/10] w-full object-cover"
              priority={true}
            />
          )}
        </Link>
        <div className="flex min-h-10 items-center justify-between bg-slate-950 px-3 py-2 text-xs font-medium text-white">
          {listing.status === "UPCOMING" ? (
            <div>Upcoming</div>
          ) : listing.status === "ENDED" ? (
            <div>
              {listing.result === "SOLD" ? (
                <span>
                  Sold for <b>{bid !== null ? `$${formatAmount(bid)}` : "—"}</b>
                </span>
              ) : bid !== null ? (
                <span>
                  Bid to <b>${formatAmount(bid)}</b>
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
                    remainingMs !== null && remainingMs < 3 * 60 * 60 * 1000 ? "text-red-600" : "",
                  )}
                >
                  {timeLeft}
                </span>
              </div>
              {bid !== null ? (
                <span>
                  Bid <b>${formatAmount(bid)}</b>
                </span>
              ) : (
                <span>
                  Starting at{" "}
                  <b>{listing.startingBid !== null ? `$${formatAmount(listing.startingBid)}` : "To be announced"}</b>
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex w-full flex-col px-3 py-3 text-sm leading-5 text-slate-600">
        <p className="line-clamp-2">{listing.description}</p>
        <span className="mt-2 block text-xs font-medium text-slate-400">{listing.miles.toLocaleString()} miles · {listing.location}</span>
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
