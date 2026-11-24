"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { capitalize, formatAmount, formatPrice, formatDateTime, formatDisplayName } from "@/app/utils/format";
import { useAuctionContext } from "@/app/context/AuctionContext";
import BidForm from "./BidForm";
import { describeAuction } from "@/app/libs/auction-display";

interface BidsProps {
  sellerName?: string | null;
  currentUserId?: string | null;
  emailVerified?: boolean;
}

const Bids: React.FC<BidsProps> = ({
  sellerName,
  currentUserId,
  emailVerified = false,
}) => {
  const { data: session } = useSession();
  const { listing, bids, phase } = useAuctionContext();
  const display = describeAuction(listing, phase, currentUserId);
  const { price, result } = display;
  const highestBidderName = formatDisplayName(
    bids.find((item) => item.userId === listing.highestBidderId)?.user.name,
    "Bidder"
  );

  // Before bidding opens there is nothing to show; the panel appears as soon as the Auction starts.
  if (display.bucket === "upcoming") return null;

  return (
    <div
      id="bids"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 className="pb-2 md:pb-4 text-lg font-bold">
        {listing.year} {capitalize(listing.make)} {capitalize(listing.model)}
      </h2>
      <div className="flex flex-col md:flex-row gap-2 lg:gap-4 md:justify-between pb-2 md:pb-4">
        <div className="md:w-1/2 w-full flex flex-col justify-between bg-slate-200 rounded-md p-2 md:p-4 gap-2 text-sm md:text-base">
          {display.tone === "sold" ? (
            <p className="text-green-600 font-bold">Sold to {highestBidderName}, congratulations!</p>
          ) : result ? (
            <div>
              <p className="font-semibold">{result}</p>
              {price.amount !== null && <p>{price.label}</p>}
            </div>
          ) : (
            <p>
              {price.label}{" "}
              <span className="font-semibold">
                {listing.highestBidderId ? highestBidderName : ""}
              </span>
            </p>
          )}
          <div className="font-bold text-4xl sm:text-5xl tracking-tight">
            {price.amount !== null ? <span>{formatPrice(price.amount)}</span> : <span>—</span>}
          </div>
        </div>

        <div className="md:w-1/2 w-full flex flex-col gap-2 text-sm">
          <p className="flex justify-start">
            <span className="w-1/4">Seller</span>
            <span className="font-semibold">
              {" "}
              {formatDisplayName(sellerName, "Seller")}
            </span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Ending</span>
            <span className="font-semibold">
              {" "}
              {listing.auctionEndsAt ? (
                <time dateTime={listing.auctionEndsAt.toISOString()}>{formatDateTime(listing.auctionEndsAt)}</time>
              ) : "To be announced"}
            </span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Views</span>
            <span className="font-semibold"> {formatAmount(listing.views)}</span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Watching</span>
            <span className="font-semibold"> {formatAmount(listing.watcherCount)}</span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Bids</span>
            <span className="font-semibold"> {formatAmount(bids.length)}</span>
          </p>
        </div>
      </div>
      {display.bucket === "live" && (display.action === null || display.timer === "closing") && display.message && (
        <p className="mt-2 text-sm text-slate-500">{display.message}</p>
      )}
      {session &&
        listing.userId !== currentUserId ? (
        <BidForm key={`${listing.id}:${currentUserId ?? ""}`} currentUserId={currentUserId} emailVerified={emailVerified} />
      ) : !session && display.action === "place-bid" ? (
        <>
          <hr />
          <div className="mt-3 text-center">
            <Link
              href={{ pathname: "/signin", query: { callbackUrl: `/listing/${listing.id}#bids` } }}
              className="inline-block rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              Sign In to Bid
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default Bids;
