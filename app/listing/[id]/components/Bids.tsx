"use client";
import axios from "axios";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { RiAuctionFill } from "react-icons/ri";
import { formatAmount, capitalize, formatDisplayName } from "@/app/utils/format";
import { useAuctionContext } from "@/app/context/AuctionContext";
import type { AcceptedBidResponse } from "@/app/types/auction-events";
import type { BidFormValues } from "@/app/types/forms";

interface BidsProps {
  sellerName?: string | null;
  currentUserId?: string | null;
}

const Bids: React.FC<BidsProps> = ({
  sellerName,
  currentUserId,
}) => {
  const { data: session } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { listing, bids, expired, acceptBid } = useAuctionContext();
  const bid = listing.currentBid;
  const amount = bid ?? listing.startingBid;
  const minimumBid = listing.startingBid !== null && listing.bidIncrement !== null &&
    listing.auctionStartsAt !== null && listing.auctionEndsAt !== null
    ? bid === null ? listing.startingBid : bid + listing.bidIncrement
    : null;
  const canBid = listing.status === "LIVE" && !expired && minimumBid !== null;
  const highestBidderName = formatDisplayName(
    bids.find((item) => item.userId === listing.highestBidderId)?.user.name,
    "Bidder"
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BidFormValues>();

  const onSubmit: SubmitHandler<BidFormValues> = (data) => {
    if (!canBid || minimumBid === null) return;
    setIsLoading(true);
    if (data.bidAmount < minimumBid) {
      toast.error(`Your bid must be at least $${formatAmount(minimumBid)}`);
      setIsLoading(false);
      return;
    }

    axios
      .post<AcceptedBidResponse>(`/api/place-bid`, { ...data, listingId: listing.id })
      .then((response) => {
        acceptBid(response.data);
        reset();
        router.refresh();
        toast.success("Bid placed successfully!");
      })
      .catch((error) => {
        toast.error(error.response?.data?.error || "Error placing bid");
      })
      .finally(() => setIsLoading(false));
  };

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
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="relative border flex border-gray-300 rounded-md has-[:focus]:ring has-[:focus]:ring-lime-500 hover:ring hover:ring-lime-500"
        >
          <input
            id="bidAmount"
            type="number"
            aria-label="Your bid amount in dollars"
            placeholder="Your bid ($)"
            min={minimumBid ?? undefined}
            step={1}
            {...register("bidAmount", { required: true, valueAsNumber: true })}
            className={clsx(
              `w-full form-input
              block rounded-l-md
              
              text-gray-900
              font-semibold
              shadow-sm                  
              focus:border-transparent
              border-none
              focus:ring-transparent
               text-right        
              placeholder:text-gray-400 
              placeholder:font-normal
              placeholder:text-left
              `,
              errors.bidAmount && "border-rose-500 focus:ring-rose-500",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            disabled={isLoading || !canBid}
          />
          <button
            disabled={isLoading || !canBid}
            type="submit"
            className="flex
        justify-center
        items-center
        px-2
        border-none
        text-sm
        font-semibold
        focus-visible:outline
        focus-visible:outline-2
        focus-visible:outline-offset-2
        bg-amber-400 hover:bg-amber-300 focus-visible:outline-amber-500
        text-slate-950"
          >
            <RiAuctionFill className="text-2xl" />
          </button>
          <div className="absolute -top-7 md:-top-10 right-0 text-rose-500">
            {errors.bidAmount && <span>This field is required</span>}
          </div>
        </form>
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
