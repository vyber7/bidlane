"use client";

import { Listing } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { formatAmount } from "@/app/utils/format";
import Button from "@/app/components/Button";
import useCountDown from "@/app/hooks/useCountDown";
import clsx from "clsx";
import { canEndAuction } from "@/app/utils/format";
import { useRouter } from "next/navigation";
import { User } from "next-auth";
import { Bid } from "@prisma/client";
import ProgressBar from "./ProgressBar";
import { FaHashtag, FaRegClock, FaRegCommentAlt } from "react-icons/fa";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import toast from "react-hot-toast";
import usePusherEvent from "@/app/hooks/usePusherEvent";
import useWatchlist from "@/app/hooks/useWatchlist";
import { logger } from "@/app/libs/logger";

interface AuctionStatusBarProps {
  listing: Listing;
  currentUser?: string | null;
  commentsCount?: number;
  bidsCount?: number;
}

const AuctionStatusBar: React.FC<AuctionStatusBarProps> = ({
  listing,
  currentUser,
  commentsCount,
  bidsCount,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [bid, setBid] = useState<number | null>(listing.currentBid);
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUser,
    initialWatching: listing.watchersIds.includes(currentUser as string),
  });
  const timeLeft = useCountDown(listing.auctionEndsAt as Date, listing.id);
  const router = useRouter();

  const endAuction = useCallback(async () => {
    setIsLoading(true);
    try {
      await axios.post("/api/auction-end", { listingId: listing.id });
      router.refresh();
    } catch (error) {
      logger.error("auction.end.client_failed", error, {
        listingId: listing.id,
      });
      toast.error("The auction could not be ended. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [listing.id, router]);

  useEffect(() => {
    axios
      .post("/api/listing-view", { listingId: listing.id, userId: currentUser })
      .catch((error) => {
        logger.warn("listing.view.client_failed", {
          listingId: listing.id,
          error: String(error),
        });
      });
  }, [listing.id, currentUser]);

  usePusherEvent<Bid & { user: User }>(
    `listing-${listing.id}`,
    "new-bid",
    (newBid) => setBid(newBid.amount)
  );

  usePusherEvent(
    `listing-${listing.id}`,
    "auction-started",
    () => router.refresh()
  );

  usePusherEvent(
    `listing-${listing.id}`,
    "auction-ended",
    () => router.refresh()
  );

  // useEffect(() => {
  //   axios
  //     .post("/api/seen-listing", { listingId: listing.id, userId: currentUser })
  //     .then((res) => {
  //       console.log("Seen listing recorded", res.data);
  //     })
  //     .catch((err) => {
  //       console.log("Error recording seen listing", err);
  //     });
  // }, [listing.id, currentUser]);

  // useEffect(() => {
  //   if (listing.auctionEndsAt) {
  //     const now = new Date();
  //     const distance = listing.auctionEndsAt.getTime() - now.getTime();

  //     if (listing.status === "ENDED") {
  //       console.log("Auction already ended");
  //       return;
  //     }

  //     if (distance <= 0) {
  //       endAuction();
  //       return;
  //     }
  //   }
  // }, [listing.auctionEndsAt, listing.status, endAuction]);

  return (
    <>
      {listing.status === "LIVE" ? (
        <div className="sticky top-11 z-[99] bg-gray-900 text-white rounded-md shadow-md shadow-gray-400">
          <ProgressBar endTime={listing.auctionEndsAt} listingId={listing.id} />
          <div className="flex flex-row flex-wrap gap-2 justify-between items-center p-4">
            <span className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md">
              LIVE
            </span>

            <span
              className={clsx(
                `font-bold flex items-center gap-1`,
                canEndAuction(timeLeft) && "text-red-600"
              )}
            >
              <b>
                <FaRegClock />
              </b>{" "}
              {timeLeft}
            </span>
            {bid ? (
              <>
                <span className="flex items-center gap-1">
                  Bid: <b>${formatAmount(bid)}</b>
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  Starting At: ${formatAmount(listing.startingBid as number)}
                </span>
              </>
            )}
            <div className="flex flex-row gap-2 justify-between items-center">
              {/*user can end the auction if they are the owner and timeLeft is <= 3 hours*/}
              {currentUser == listing.userId ? (
                <>
                  {/* {!canEndAuction(timeLeft) && (
                <div className="mb-2 text-sm text-center text-gray-600">
                  (You can end the auction if less than 3 hours remain.)
                </div>
              )} */}
                  <Button
                    type="submit"
                    onClick={endAuction}
                    disabled={isLoading || timeLeft !== "ENDING..."}
                  >
                    End Auction
                  </Button>
                </>
              ) : (
                <Link
                  href="#bids"
                  className="px-4 py-2 text-sm font-semibold text-white bg-lime-500 hover:bg-lime-600 rounded-md"
                >
                  Place Bid
                </Link>
              )}
              <Link
                href="#comments"
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-md"
              >
                Comment
              </Link>
              {currentUser !== listing.userId &&
                <button
                  type="button"
                  onClick={toggle}
                  disabled={isUpdating}
                  aria-label={
                    watching ? "Remove from watchlist" : "Add to watchlist"
                  }
                  className="text-2xl text-yellow-500 hover:text-yellow-600 disabled:opacity-50"
                >
                  {watching ? <GoStarFill /> : <GoStar />}
                </button>}
            </div>
          </div>
        </div>
      ) : listing.status === "ENDED" ? (
        <div className="sticky top-11 z-[99] bg-gray-900 text-white p-4 rounded-md shadow-md shadow-gray-400 ">
          <div className="flex flex-row flex-wrap gap-2 justify-between items-center">
            <span className="px-4 py-2 text-sm font-semibold text-white bg-gray-600 rounded-md">
              ENDED
            </span>
            <div>
              {listing.currentBid &&
              listing.currentBid < (listing.reservePrice || 0) ? (
                <>
                  Reserve not met, bid to{" "}
                  <span>
                    <b>${formatAmount(listing.currentBid)}</b>
                  </span>{" "}
                </>
              ) : listing.currentBid ? (
                <>
                  Sold for{" "}
                  <span>
                    <b>${formatAmount(listing.currentBid)}</b>
                  </span>
                </>
              ) : (
                <>
                  <b>No bids were placed.</b>
                </>
              )}
            </div>
            <div className="flex flex-row gap-4">
              <Link href="#bids" className="flex items-center gap-1">
                <FaHashtag />
                Bids {bidsCount}
              </Link>
              <Link href="#comments" className="flex items-center gap-1">
                <FaRegCommentAlt />
                Comments {commentsCount}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="sticky top-11 z-[99] bg-gray-900 p-4 rounded-md shadow-md shadow-gray-400">
          <span className="px-4 py-2 text-sm font-semibold text-white bg-yellow-600 rounded-md">
            UPCOMING
          </span>
        </div>
      )}
    </>
  );
};

export default AuctionStatusBar;
