"use client";

import Link from "next/link";
import { GoTrash } from "react-icons/go";
import Image from "next/image";
import type { PublicListing, SellerListing } from "@/app/libs/listing-codec";
import type { ReviewLabel } from "@/app/libs/listing-review";
import { formatAmount, formatPrice } from "@/app/utils/format";
import clsx from "clsx";
import { FiArrowUpRight, FiClock, FiEye, FiMapPin } from "react-icons/fi";
import useAuction from "@/app/hooks/useAuction";
import { describeAuction, type AuctionDisplay } from "@/app/libs/auction-display";
import { CldImage } from "next-cloudinary";
import { transactionAccess, transactionHref } from "@/app/libs/transaction-completion";

const chipClasses: Record<AuctionDisplay["tone"], string> = {
  live: "bg-red-50 text-red-700 ring-red-100",
  upcoming: "bg-blue-50 text-blue-700 ring-blue-100",
  sold: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  neutral: "bg-gray-100 text-gray-600 ring-gray-200",
};

/** A seller's own Listing, with its Review label worked out on the server. */
export type AccountListing = SellerListing & { reviewLabel: ReviewLabel };

interface AccountListingBoxProps {
  listing: PublicListing & Partial<Pick<AccountListing, "reviewLabel" | "reviewNote">>;
  currentUserId?: string | null;
  uploaded: boolean;
  /** Removes a watched Listing from the Watchlist; the dashboard owns undo. */
  onRemove?: () => void;
}

const AccountListingBox: React.FC<AccountListingBoxProps> = ({
  listing: initialListing,
  currentUserId,
  uploaded,
  onRemove,
}) => {
  const { listing, phase, timeLeft } = useAuction(initialListing);
  const transaction = uploaded ? transactionAccess(listing, currentUserId) : null;

  const display = describeAuction(listing, phase, currentUserId);
  const { label: amountLabel, amount } = display.price;

  return (
    <article className="p-4 transition-colors hover:bg-gray-50 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          className="relative h-48 w-full shrink-0 overflow-hidden rounded-lg bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 sm:h-32 sm:w-52"
          href={`/listing/${listing.id}`}
        >
          {listing.coverImage ? (
            <CldImage
              src={listing.coverImage}
              alt={`${listing.year} ${listing.make} ${listing.model}`}
              fill
              sizes="(min-width: 640px) 208px, calc(100vw - 64px)"
              className="object-cover hover:opacity-90 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:scale-105"
              crop="fill"
            />
          ) : (
            <Image
              src="/images/default-vehicle-image.png"
              alt={`${listing.year} ${listing.make} ${listing.model}`}
              fill
              sizes="(min-width: 640px) 208px, calc(100vw - 64px)"
              className="object-cover hover:opacity-90"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {uploaded && display.bucket === "upcoming" && listing.reviewLabel && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">{listing.reviewLabel}</span>}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${chipClasses[display.tone]}`}>
                  {display.headline}
                </span>
                <span className="flex items-center gap-1 text-xs tabular-nums text-gray-600">
                  <FiEye aria-hidden="true" /> <span className="sr-only">Views:</span> {formatAmount(listing.views)}
                </span>
              </div>
              <Link href={`/listing/${listing.id}`} className="hover:underline">
                <h3 className="truncate text-lg font-bold text-gray-950 sm:text-xl">
                  {listing.year} {listing.make} {listing.model}
                </h3>
              </Link>
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <FiMapPin aria-hidden="true" className="shrink-0" /> <span className="min-w-0 truncate">{listing.location}</span>
              </p>
            </div>
            {!uploaded && onRemove && (
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                onClick={onRemove}
                aria-label={`Remove ${listing.year} ${listing.make} ${listing.model} from Watchlist`}
                title="Remove from Watchlist"
              >
                <GoTrash aria-hidden="true" />
              </button>
            )}
          </div>

          <p className="mt-3 line-clamp-1 text-sm text-gray-600">
            {listing.description}
          </p>
          {uploaded && listing.reviewNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-amber-800">{listing.reviewNote}</p>}

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-gray-100 pt-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-gray-500">{amountLabel}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-950">
                  {amount !== null ? formatPrice(amount) : "No bids yet"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Mileage</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-950">
                  {formatAmount(listing.miles)} mi
                </p>
              </div>
              {display.bucket === "live" && (
                <div className="hidden sm:block">
                  <p className="text-xs text-gray-500">Time left</p>
                  <p
                    className={clsx(
                      "mt-0.5 flex items-center gap-1 text-sm font-bold tabular-nums",
                      display.timer === "closing" ? "text-red-600" : "text-gray-950"
                    )}
                  >
                    <FiClock aria-hidden="true" /> {display.timer === "closing" ? display.message : timeLeft || "Calculating…"}
                  </p>
                </div>
              )}
            </div>
            <Link
              href={transaction?.canComplete ? transactionHref(listing.id) : `/listing/${listing.id}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-gray-950 hover:underline"
            >
              {transaction?.canComplete ? "Complete Transaction" : "View Listing"} <FiArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
};

export default AccountListingBox;
