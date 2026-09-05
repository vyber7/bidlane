"use client";

import Image from "next/image";
import Link from "next/link";
import { Bid, Listing, User } from "@prisma/client";
import { canEndAuction, formatAmount } from "@/app/utils/format";
import { CldImage } from "next-cloudinary";
import { FaRegClock } from "react-icons/fa";
import clsx from "clsx";
import useCountDown from "../hooks/useCountDown";
import { useState } from "react";
import usePusherEvent from "../hooks/usePusherEvent";

interface SideListingBoxProps {
  auction: Listing;
  variant?: "live" | "sold";
}

const SideListingBox: React.FC<SideListingBoxProps> = ({
  auction,
  variant,
}) => {
  const [bid, setBid] = useState<number | null>(auction.currentBid);

  const timeLeft = useCountDown(auction.auctionEndsAt as Date, auction.id);

  usePusherEvent<Bid & { user: User }>(
    `listing-${auction.id}`,
    "new-bid",
    (newBid) => setBid(newBid.amount)
  );

  return (
    <div className="w-[31%] lg:w-full rounded-md shadow-md shadow-gray-600 hover:ring hover:ring-gray-900">
      <Link href={`/listing/${auction.id}`} className="relative">
        <div className="absolute w-full">
          {variant === "live" && (
            <>
              {" "}
              <div className="flex gap-1 items-center rounded-t-md bg-black bg-opacity-60 p-1 pb-0 text-xs text-white">
                <FaRegClock />{" "}
                <span
                  className={clsx(
                    canEndAuction(timeLeft) ? "text-red-600" : ""
                  )}
                >
                  {timeLeft}
                </span>
              </div>
              <div className="bg-black bg-opacity-60 p-1 pt-0 text-xs text-white w-full">
                {bid ? (
                  <>
                    Bid <b>${formatAmount(bid as number)}</b>
                  </>
                ) : (
                  <>
                    Starting at{" "}
                    <b>${formatAmount(auction.startingBid as number)}</b>
                  </>
                )}
              </div>
            </>
          )}

          {variant === "sold" && (
            <div className="bg-black bg-opacity-60 p-1 rounded-t-md text-xs text-white w-full">
              Sold for <b>${formatAmount(auction.currentBid as number)}</b>
            </div>
          )}
        </div>
        {auction.coverImage ? (
          <CldImage
            src={auction.coverImage}
            alt={auction.model}
            width={200}
            height={150}
            crop="thumb"
            gravity="face"
            zoom="1.0"
            className="w-full rounded-md object-cover"
          />
        ) : (
          <Image
            src="/images/default-vehicle-image.png"
            alt={auction.model}
            width={200}
            height={150}
            className="w-full rounded-md object-cover"
          />
        )}
      </Link>
    </div>
  );
};

export default SideListingBox;
