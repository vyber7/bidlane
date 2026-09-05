"use client";
import { Bid, Listing, User } from "@prisma/client";
import axios from "axios";
import clsx from "clsx";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { formatAmount, capitalize } from "@/app/utils/format";
import usePusherEvent from "@/app/hooks/usePusherEvent";

interface BidsProps {
  listing: Listing;
  bids: (Bid & { user: { name: string | null } })[];
  sellerName?: string | null;
  sellerEmail?: string | null;
}

const Bids: React.FC<BidsProps> = ({
  listing,
  bids,
  sellerName,
  sellerEmail,
}) => {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [bid, setBid] = useState<number | null>(listing.currentBid);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>();

  usePusherEvent<Bid & { user: User }>(
    `listing-${listing.id}`,
    "new-bid",
    (newBid) => setBid(newBid.amount)
  );

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);
    const minimumBid =
      bid === null
        ? (listing.startingBid as number)
        : bid + (listing.bidIncrement as number);

    if (data.bidAmount < minimumBid) {
      toast.error(`Your bid must be at least $${formatAmount(minimumBid)}`);
      setIsLoading(false);
      return;
    }

    axios
      .post(`/api/place-bid`, { ...data, listingId: listing.id })
      .then(() => {
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
      className="p-4 border shadow-md rounded-md shadow-gray-400 bg-white"
    >
      <h2 className="text-lg font-bold">
        {listing.year} {listing.make} {listing.model}
      </h2>
      <div className="flex flex-col md:flex-row gap-2 md:justify-between pb-4">
        <div>
          {listing.status === "ENDED" && listing.result === "SOLD" ? (
            <p>
              {listing.currentBid
                ? `Sold to ${
                    listing.highestBidderId
                      ? capitalize(
                          bids.find(
                            (bid) => bid.userId === listing.highestBidderId
                          )?.user.name as string
                        )
                      : ""
                  }, congratulations!`
                : "No bids were placed."}
            </p>
          ) : listing.status === "ENDED" && listing.currentBid === null ? (
            <p>No bids were placed</p>
          ) : listing.status === "ENDED" &&
            listing.result === "RESERVE_NOT_MET" ? (
            <p>Reserve not met, bid to</p>
          ) : (
            <p>
              {listing.currentBid ? "Current Bid" : "Starting at"}{" "}
              <span className="font-semibold">
                {listing.highestBidderId
                  ? capitalize(
                      bids.find((bid) => bid.userId === listing.highestBidderId)
                        ?.user.name as string
                    )
                  : ""}
              </span>
            </p>
          )}
          <div className="font-semibold text-6xl">
            {bid ? (
              <span>${formatAmount(bid as number)}</span>
            ) : (
              <span>${formatAmount(listing.startingBid as number)}</span>
            )}
          </div>
        </div>

        <div className="md:w-1/2 w-full flex flex-col gap-2 text-sm">
          <p className="flex justify-start">
            <span className="w-1/4">Seller</span>
            <span className="font-semibold">
              {" "}
              {capitalize(sellerName as string)}
            </span>
          </p>
          <p className="flex justify-start">
            <span className="w-1/4">Ending</span>
            <span className="font-semibold">
              {" "}
              {new Date(listing.auctionEndsAt!).toLocaleString()}
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
      {listing.status === "ENDED" ? null : session &&
        sellerEmail !== session?.user?.email ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="border flex border-gray-300 rounded-md has-[:focus]:ring has-[:focus]:ring-gray-500 hover:ring hover:ring-gray-500"
        >
          <input
            id="bidAmount"
            type="number"
            placeholder="Your Bid"
            min={
              bid === null
                ? (listing.startingBid as number)
                : bid + (listing.bidIncrement as number)
            }
            step={listing.bidIncrement || 1}
            {...register("bidAmount", { required: true, valueAsNumber: true })}
            className={clsx(
              `w-4/5 form-input
              block rounded-l-md
              
              text-gray-900
              shadow-sm                  
              focus:border-transparent
              border-none
              focus:ring-transparent
                       
              placeholder:text-gray-400
              `,
              errors.bidAmount && "border-rose-500 focus:ring-rose-500",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            disabled={isLoading}
          />
          <button
            disabled={isLoading}
            type="submit"
            className="w-1/5 flex
        justify-center
        items-center
        rounded-r-md
        border-none
        text-sm
        font-semibold
        focus-visible:outline
        focus-visible:outline-2
        focus-visible:outline-offset-2
        bg-lime-500 hover:bg-lime-600 focus-visible:outline-lime-600
        text-white"
          >
            Place a Bid
          </button>
          <div>{errors.bidAmount && <span>This field is required</span>}</div>
        </form>
      ) : !session ? (
        <div className="mt-4 text-red-500 font-bold">
          Please log in to place a bid.
        </div>
      ) : null}
    </div>
  );
};

export default Bids;
