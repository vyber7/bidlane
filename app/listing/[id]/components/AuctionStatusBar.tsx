"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { formatAmount } from "@/app/utils/format";
import Button from "@/app/components/Button";
import NoReserveBadge from "@/app/components/NoReserveBadge";
import { useAuctionContext } from "@/app/context/AuctionContext";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import ProgressBar from "./ProgressBar";
import {
  FaHashtag,
  FaRegClock,
  FaRegCommentAlt,
} from "react-icons/fa";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import toast from "react-hot-toast";
import useWatchlist from "@/app/hooks/useWatchlist";
import { logger } from "@/app/libs/logger";
import { transactionAccess, transactionHref } from "@/app/libs/transaction-completion";
import { describeAuction } from "@/app/libs/auction-display";

interface AuctionStatusBarProps {
  currentUser?: string | null;
}

const AuctionStatusBar: React.FC<AuctionStatusBarProps> = ({
  currentUser,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoFinalizingDeadline, setAutoFinalizingDeadline] = useState<string | null>(null);
  const { listing, bids, comments, remainingMs, timeLeft, phase } = useAuctionContext();
  const display = describeAuction(listing, phase, currentUser);
  const closing = display.timer === "closing";
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: currentUser,
    initialWatching: listing.isWatching,
  });
  const router = useRouter();
  const finalizationRequested = useRef<string | null>(null);
  const deadline = listing.auctionEndsAt?.toISOString() ?? "";
  const finalizationKey = `${listing.id}:${deadline}`;
  const isAutoFinalizing = autoFinalizingDeadline === finalizationKey;

  const retryFinalization = useCallback(async () => {
    setIsLoading(true);
    try {
      await axios.post("/api/auction-finalize", { listingId: listing.id });
      router.refresh();
    } catch (error) {
      logger.error("auction.finalize.client_failed", error, {
        listingId: listing.id,
      });
      toast.error(getApiErrorMessage(error, "The auction results could not be finalized. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, [listing.id, router]);

  useEffect(() => {
    if (!closing || finalizationRequested.current === finalizationKey) {
      return;
    }

    finalizationRequested.current = finalizationKey;
    setAutoFinalizingDeadline(finalizationKey);
    axios
      .post("/api/auction-finalize", { listingId: listing.id })
      .then(() => router.refresh())
      .catch((error: unknown) => {
        logger.warn("auction.auto_finalize_client_failed", {
          listingId: listing.id,
          error: String(error),
        });
        if (finalizationRequested.current === finalizationKey) {
          finalizationRequested.current = null;
        }
        router.refresh();
      })
      .finally(() => setAutoFinalizingDeadline((current) => current === finalizationKey ? null : current));
  }, [closing, finalizationKey, listing.id, router]);

  useEffect(() => {
    axios
      .post("/api/listing-view", { listingId: listing.id })
      .catch((error: unknown) => {
        logger.warn("listing.view.client_failed", {
          listingId: listing.id,
          error: String(error),
        });
      });
  }, [listing.id, currentUser]);

  const transaction = transactionAccess(listing, currentUser);
  const owner = currentUser === listing.userId;
  const { headline, price, result } = display;
  const live = display.bucket === "live";
  const ended = display.bucket === "results";
  const amountLabel = price.amount !== null ? `$${formatAmount(price.amount)}` : null;
  const announcedPrice = amountLabel ? ` ${price.label} ${amountLabel}.` : ended ? "" : " Bid amount to be announced.";

  return (
    <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
      <p role="status" aria-atomic="true" className="sr-only">
        {`${headline}.${announcedPrice}${result ? ` ${result}.` : ""}`}
      </p>
      {live && <ProgressBar remainingMs={remainingMs} />}
      <div className="space-y-4 p-5 sm:space-y-6 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className={clsx("rounded-full px-3 py-1 text-xs font-bold", display.tone === "live" ? "bg-amber-400 text-slate-950" : "bg-white/10 text-slate-200")}>
            {display.timer === "countdown" ? `● ${headline}` : headline}
          </span>
          {!owner && !ended && (
            <button type="button" onClick={toggle} disabled={isUpdating} aria-pressed={watching}
              aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
              className="rounded-lg p-2 text-2xl text-amber-400 hover:bg-white/10 disabled:opacity-50">
              {watching ? <GoStarFill /> : <GoStar />}
            </button>
          )}
        </div>
        {display.noReserveNote && (
          <div className="space-y-2">
            <NoReserveBadge isNoReserve={listing.isNoReserve} />
            <p className="text-xs leading-5 text-slate-300">{display.noReserveNote}</p>
          </div>
        )}
        <div>
          <p className="mb-2 text-sm text-slate-400">{price.label}</p>
          <p className="text-4xl font-bold tracking-tight tabular-nums">{amountLabel ?? (ended ? "—" : "To be announced")}</p>
          {result && <p className="mt-2 text-sm text-amber-400">{result}</p>}
        </div>
        {display.timer === "countdown" && <div className="flex items-center justify-between gap-3 border-y border-white/10 py-4 text-sm">
          <span className="flex items-center gap-2 text-slate-400"><FaRegClock /> Time left</span>
          <span className="font-semibold tabular-nums">{timeLeft || "Calculating…"}</span>
        </div>}
        {display.action === "retry-finalization" ? (
          <Button onClick={retryFinalization} disabled={isLoading || isAutoFinalizing}>{isLoading || isAutoFinalizing ? "Finalizing auction…" : "Retry finalization"}</Button>
        ) : display.action === "place-bid" ? (
          <Link href="#bids" className="block rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300">Place a bid</Link>
        ) : display.message ? (
          <p className="text-sm leading-6 text-slate-400">{display.message}</p>
        ) : null}
        {transaction?.canComplete && (
          <div className="space-y-3">
            <Link href={transactionHref(listing.id)} className="block rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300">{transaction.role === "seller" ? "View sale details" : "View purchase details"}</Link>
            <p className="text-xs leading-5 text-slate-400">Contact the {transaction.role === "seller" ? "buyer" : "seller"} to agree payment, paperwork, and pickup.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-5 text-sm text-slate-400">
          {display.bucket !== "upcoming" && <Link href="#bids" className="flex items-center gap-2 hover:text-white"><FaHashtag />{bids.length} bids</Link>}
          <Link href="#comments" aria-live="polite" aria-atomic="true" className="flex items-center gap-2 hover:text-white"><FaRegCommentAlt />{comments.length} comments</Link>
        </div>
      </div>
    </section>
  );
};

export default AuctionStatusBar;
