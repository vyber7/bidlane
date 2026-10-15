"use client";

import { useSession } from "next-auth/react";
import { formatAmount, capitalize, formatDisplayName } from "@/app/utils/format";
import { useAuctionContext } from "@/app/context/AuctionContext";
import BidForm from "./BidForm";

interface BidsProps {
  sellerName?: string | null;
  currentUserId?: string | null;
}

const Bids: React.FC<BidsProps> = ({
  sellerName,
  currentUserId,
}) => {
  const { data: session } = useSession();
  const { listing, bids, expired } = useAuctionContext();
  const bid = listing.currentBid;
  const amount = bid ?? listing.startingBid;
  const minimumBid = listing.startingBid !== null && listing.bidIncrement !== null &&
    listing.auctionStartsAt !== null && listing.auctionEndsAt !== null
    ? bid === null ? listing.startingBid : bid + listing.bidIncrement
    : null;
  const canBid = listing.status === "LIVE" && !expired && minimumBid !== null &&
    Number.isSafeInteger(minimumBid) && minimumBid <= 2_147_483_647;
  const highestBidderName = formatDisplayName(
    bids.find((item) => item.userId === listing.highestBidderId)?.user.name,
    "Bidder"
  );

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
          {listing.status === "ENDED" && listing.result === "SOLD" ? (
            <p className="text-green-600 font-bold">
              {bid !== null ? `Sold to ${highestBidderName}, congratulations!` : "No bids were placed."}
            </p>
          ) : listing.status === "ENDED" && listing.currentBid === null ? (
            <p>No bids were placed</p>
          ) : listing.status === "ENDED" &&
            listing.result === "RESERVE_NOT_MET" ? (
            <p>Reserve not met, bid to</p>
          ) : (
            <p>
              {bid !== null ? "Current Bid" : "Starting at"}{" "}
              <span className="font-semibold">
                {listing.highestBidderId ? highestBidderName : ""}
              </span>
            </p>
          )}
          <div className="font-bold text-4xl sm:text-5xl tracking-tight">
            {amount !== null ? <span>${formatAmount(amount)}</span> : <span>—</span>}
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
              {listing.auctionEndsAt ? new Date(listing.auctionEndsAt).toLocaleString() : "To be announced"}
            </span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Views</span>
            <span className="font-semibold"> {listing.views}</span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Watching</span>
            <span className="font-semibold"> {listing.watchersIds.length}</span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Bids</span>
            <span className="font-semibold"> {bids.length}</span>
          </p>
        </div>
      </div>
      {listing.status === "LIVE" && minimumBid === null && (
        <p className="mt-2 text-sm text-slate-500">Bidding is unavailable until the auction is configured.</p>
      )}
      {listing.status !== "LIVE" ? null : session &&
        listing.userId !== currentUserId ? (
        <BidForm key={listing.id} minimumBid={minimumBid} canBid={canBid} currentUserId={currentUserId} />
      ) : !session ? (
        <>
          <hr />
          <div className="text-rose-500 mt-2 md:mt-4 text-center">
            Please log in to place a bid.
          </div>
        </>
      ) : null}
    </div>
  );
};

export default Bids;
