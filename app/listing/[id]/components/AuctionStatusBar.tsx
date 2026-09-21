"use client";

import { Listing } from "@prisma/client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { formatAmount } from "@/app/utils/format";
import Button from "@/app/components/Button";
import useCountDown from "@/app/hooks/useCountDown";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { User } from "next-auth";
import { Bid } from "@prisma/client";
import ProgressBar from "./ProgressBar";
import {
  FaHashtag,
  FaRegClock,
  FaRegCommentAlt,
} from "react-icons/fa";
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
  const [isAutoFinalizing, setIsAutoFinalizing] = useState(false);
  const [bid, setBid] = useState<number | null>(listing.currentBid);
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUser,
    initialWatching: listing.watchersIds.includes(currentUser as string),
  });
  const timeLeft = useCountDown(listing.auctionEndsAt as Date, listing.id);
  const router = useRouter();
  const finalizationRequested = useRef(false);

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
    if (
      listing.status !== "LIVE" ||
      timeLeft !== "ENDING..." ||
      finalizationRequested.current
    ) {
      return;
    }

    finalizationRequested.current = true;
    setIsAutoFinalizing(true);
    axios
      .post("/api/auction-finalize", { listingId: listing.id })
      .then(() => router.refresh())
      .catch((error) => {
        logger.warn("auction.auto_finalize_client_failed", {
          listingId: listing.id,
          error: String(error),
        });
        finalizationRequested.current = false;
        setIsAutoFinalizing(false);
        router.refresh();
      });
  }, [listing.id, listing.status, router, timeLeft]);

  useEffect(() => {
    axios
      .post("/api/listing-view", { listingId: listing.id })
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
    (newBid) => {
      setBid(newBid.amount);
      router.refresh();
    }
  );

  usePusherEvent(
    `listing-${listing.id}`,
    "new-comment",
    () => router.refresh()
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

  const live = listing.status === "LIVE";
  const ended = listing.status === "ENDED";
  const amount = bid ?? listing.startingBid;
  const label = ended
    ? listing.result === "SOLD" ? "Sold for" : bid !== null ? "Highest bid" : "No bids placed"
    : bid !== null ? "Current bid" : "Starting bid";

  return (
    <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
      {live && <ProgressBar endTime={listing.auctionEndsAt} listingId={listing.id} />}
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <span className={clsx("rounded-full px-3 py-1 text-xs font-bold", live ? "bg-amber-400 text-slate-950" : "bg-white/10 text-slate-200")}>
            {live ? "● Live auction" : ended ? "Auction ended" : "Coming soon"}
          </span>
          {currentUser !== listing.userId && !ended && (
            <button type="button" onClick={toggle} disabled={isUpdating} aria-pressed={watching}
              aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
              className="rounded-lg p-2 text-2xl text-amber-400 hover:bg-white/10 disabled:opacity-50">
              {watching ? <GoStarFill /> : <GoStar />}
            </button>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm text-slate-400">{label}</p>
          <p className="text-4xl font-bold tracking-tight tabular-nums">{ended && bid === null ? "—" : amount !== null ? `$${formatAmount(amount)}` : "To be announced"}</p>
          {ended && listing.result === "RESERVE_NOT_MET" && <p className="mt-2 text-sm text-amber-400">Reserve not met</p>}
        </div>
        {live && <div className="flex items-center justify-between gap-3 border-y border-white/10 py-4 text-sm">
          <span className="flex items-center gap-2 text-slate-400"><FaRegClock /> Time left</span>
          <span className="font-semibold tabular-nums">{timeLeft || "Calculating…"}</span>
        </div>}
        {live && timeLeft === "ENDING..." ? (
          currentUser === listing.userId ? (
            <Button onClick={endAuction} disabled={isLoading || isAutoFinalizing}>{isLoading || isAutoFinalizing ? "Finalizing auction…" : "Retry finalization"}</Button>
          ) : (
            <p className="text-sm leading-6 text-slate-400">Finalizing auction results…</p>
          )
        ) : live ? currentUser === listing.userId ? (
          <Button onClick={endAuction} disabled={isLoading || timeLeft !== "ENDING..."}>{isLoading ? "Ending auction…" : "End auction"}</Button>
        ) : (
          <Link href="#bids" className="block rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300">Place a bid</Link>
        ) : !ended ? (
          <p className="text-sm leading-6 text-slate-400">Bidding hasn’t opened yet. {currentUser === listing.userId ? "Set up your auction below when you’re ready." : "Add this vehicle to your watchlist to find it again easily."}</p>
        ) : null}
        <div className="flex flex-wrap gap-5 text-sm text-slate-400">
          {(live || ended) && <Link href="#bids" className="flex items-center gap-2 hover:text-white"><FaHashtag />{bidsCount ?? 0} bids</Link>}
          <Link href="#comments" aria-live="polite" aria-atomic="true" className="flex items-center gap-2 hover:text-white"><FaRegCommentAlt />{commentsCount ?? 0} comments</Link>
        </div>
      </div>
    </section>
  );
};

export default AuctionStatusBar;
