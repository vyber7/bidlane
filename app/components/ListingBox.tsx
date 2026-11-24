"use client";

import Image from "next/image";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import Title from "./Title";
import NoReserveBadge from "./NoReserveBadge";
import { GrEdit } from "react-icons/gr";
import { FaRegClock } from "react-icons/fa";
import { useId } from "react";
import type { PublicListing } from "@/app/libs/listing-payload";
import useAuction from "../hooks/useAuction";
import { capitalize, formatAmount, formatBid } from "../utils/format";
import { clsx } from "clsx";
import { CldImage } from "next-cloudinary";
import useWatchlist from "../hooks/useWatchlist";
import { describeAuction } from "@/app/libs/auction-display";

interface ListingBoxProps {
  listing: PublicListing;
  currentUserId?: string | null;
}

const ListingBox: React.FC<ListingBoxProps> = ({ listing: initialListing, currentUserId }) => {
  const { listing, phase, remainingMs, timeLeft } = useAuction(initialListing);
  const titleId = useId();
  const title = `${listing.year} ${capitalize(listing.make)} ${capitalize(listing.model)}`;
  const href = `/listing/${listing.id}`;
  const isOwner = listing.userId === currentUserId;
  const display = describeAuction(listing, phase, currentUserId);
  const { price } = display;
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUserId,
    initialWatching: listing.isWatching,
  });

  return (
    <div className="flex h-full flex-wrap justify-between">
      <Link className="min-w-0 flex-1" href={href}>
        <Title id={titleId}>{title}</Title>
      </Link>
      {display.action === "edit-listing" && (
        <Link
          href={`${href}#edit-listing`}
          aria-label={`Edit listing for ${title}`}
          className="flex items-center px-3 text-sm hover:bg-slate-100"
        >
          <GrEdit aria-hidden="true" />
        </Link>
      )}
      {!isOwner && (
        <button
          type="button"
          className="flex items-center px-3 text-xl motion-safe:transition-transform motion-safe:hover:scale-110"
          onClick={toggle}
          disabled={isUpdating}
          aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
        >
          {watching ? (
            <GoStarFill aria-hidden="true" className="text-yellow-500" />
          ) : (
            <GoStar aria-hidden="true" className="text-yellow-500" />
          )}
        </button>
      )}

      <div className="flex flex-col w-full">
        <div className="relative">
          <Link className="block w-full" href={href} aria-labelledby={titleId}>
            {listing.coverImage ? (
              <CldImage
                src={listing.coverImage}
                width={400}
                height={250}
                alt=""
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
                sizes="(min-width: 1024px) 350px, (min-width: 640px) 50vw, 100vw"
                crop="fill"
              />
            ) : (
              <Image
                src="/images/default-vehicle-image.png"
                alt=""
                width={400}
                height={250}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
                sizes="(min-width: 1024px) 350px, (min-width: 640px) 50vw, 100vw"
              />
            )}
          </Link>
          {listing.isNoReserve && (
            <span className="pointer-events-none absolute left-3 top-3 z-10">
              <NoReserveBadge isNoReserve={listing.isNoReserve} />
            </span>
          )}
        </div>
        <div className="flex min-h-10 items-center justify-between bg-slate-950 px-3 py-2 text-xs font-medium text-white">
          {display.bucket === "upcoming" ? (
            <div>{display.headline}</div>
          ) : display.bucket === "results" ? (
            <div>
              {price.label}{price.amount !== null && <> <b>{formatBid(price.amount)}</b></>}
            </div>
          ) : (
            <>
              {display.timer === "closing" ? (
                <div>{display.message}</div>
              ) : (
                <div className="flex items-center gap-2">
                  <FaRegClock aria-hidden="true" />
                  <span
                    className={clsx(
                      remainingMs !== null && remainingMs < 3 * 60 * 60 * 1000 ? "text-red-400" : "",
                    )}
                  >
                    {timeLeft}
                  </span>
                </div>
              )}
              <span aria-live="polite" aria-atomic="true">
                <span className="sr-only">{title}: </span>
                {price.label}{" "}
                <b>{price.amount !== null ? formatBid(price.amount) : "To be announced"}</b>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex w-full flex-col px-3 py-3 text-sm leading-5 text-slate-600">
        <p className="line-clamp-2">{listing.description}</p>
        <span className="mt-2 block break-words text-xs font-medium text-slate-600">{formatAmount(listing.miles)} miles · {listing.location}</span>
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
