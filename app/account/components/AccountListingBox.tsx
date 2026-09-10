"use client";

import Link from "next/link";
import { GoTrash } from "react-icons/go";
import Image from "next/image";
import { Listing } from "@prisma/client";
import { formatAmount, canEndAuction } from "@/app/utils/format";
import clsx from "clsx";
import { FiArrowUpRight, FiClock, FiEye, FiMapPin } from "react-icons/fi";
import useCountDown from "@/app/hooks/useCountDown";
import { useState } from "react";
import { CldImage } from "next-cloudinary";
import useWatchlist from "@/app/hooks/useWatchlist";

interface AccountListingBoxProps {
  listing: Listing;
  currentUserId?: string | null;
  watching: boolean;
  uploaded: boolean;
}

const AccountListingBox: React.FC<AccountListingBoxProps> = ({
  listing,
  currentUserId,
  watching,
  uploaded,
}) => {
  const [bid] = useState<number | null>(listing.currentBid);
  const { isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUserId,
    initialWatching: watching,
  });

  const timeLeft = useCountDown(listing.auctionEndsAt as Date, listing.id);

  const status =
    listing.status === "LIVE"
      ? { label: "Live", classes: "bg-red-50 text-red-700 ring-red-100" }
      : listing.status === "UPCOMING"
        ? { label: "Upcoming", classes: "bg-blue-50 text-blue-700 ring-blue-100" }
        : listing.result === "SOLD"
          ? { label: "Sold", classes: "bg-emerald-50 text-emerald-700 ring-emerald-100" }
          : { label: "Ended", classes: "bg-gray-100 text-gray-600 ring-gray-200" };

  const amountLabel =
    listing.status === "UPCOMING"
      ? "Starting bid"
      : listing.result === "SOLD"
        ? "Sold for"
        : listing.status === "ENDED"
          ? "Final bid"
          : "Current bid";
  const amount = bid ?? listing.startingBid;

  return (
    <article className="p-4 transition-colors hover:bg-gray-50 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          className="relative h-48 w-full shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-32 sm:w-52"
          href={`/listing/${listing.id}`}
        >
          {listing.coverImage ? (
            <CldImage
              src={listing.coverImage}
              alt={`${listing.year} ${listing.make} ${listing.model}`}
              fill
              sizes="(min-width: 640px) 208px, calc(100vw - 64px)"
              className="object-cover transition-transform duration-300 hover:scale-105"
              crop="fill"
            />
          ) : (
            <Image
              src="/images/default-vehicle-image.png"
              alt={`${listing.year} ${listing.make} ${listing.model}`}
              fill
              sizes="(min-width: 640px) 208px, calc(100vw - 64px)"
              className="object-cover"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${status.classes}`}>
                  {status.label}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <FiEye /> {formatAmount(listing.views)}
                </span>
              </div>
              <Link href={`/listing/${listing.id}`} className="hover:underline">
                <h3 className="truncate text-lg font-bold text-gray-950 sm:text-xl">
                  {listing.year} {listing.make} {listing.model}
                </h3>
              </Link>
              <p className="mt-1 flex items-center gap-1 truncate text-sm text-gray-500">
                <FiMapPin className="shrink-0" /> {listing.location}
              </p>
            </div>
            {!uploaded && (
              <button
                type="button"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                onClick={toggle}
                disabled={isUpdating}
                aria-label="Remove from watchlist"
                title="Remove from watchlist"
              >
                <GoTrash />
              </button>
            )}
          </div>

          <p className="mt-3 line-clamp-1 text-sm text-gray-600">
            {listing.description}
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-3">
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-gray-500">{amountLabel}</p>
                <p className="mt-0.5 text-sm font-bold text-gray-950">
                  {amount ? `$${formatAmount(amount)}` : "No bids yet"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Mileage</p>
                <p className="mt-0.5 text-sm font-bold text-gray-950">
                  {formatAmount(listing.miles)} mi
                </p>
              </div>
              {listing.status === "LIVE" && (
                <div className="hidden sm:block">
                  <p className="text-xs text-gray-500">Time left</p>
                  <p
                    className={clsx(
                      "mt-0.5 flex items-center gap-1 text-sm font-bold",
                      canEndAuction(timeLeft) ? "text-red-600" : "text-gray-950"
                    )}
                  >
                    <FiClock /> {timeLeft || "Calculating…"}
                  </p>
                </div>
              )}
            </div>
            <Link
              href={`/listing/${listing.id}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-gray-950 hover:underline"
            >
              View listing <FiArrowUpRight />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default AccountListingBox;
