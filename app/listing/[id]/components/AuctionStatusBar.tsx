"use client";

import { formatPrice, formatCount } from "@/app/utils/format";
import Button from "@/app/components/Button";
import NoReserveBadge from "@/app/components/NoReserveBadge";
import { useAuctionView } from "@/app/context/AuctionContext";
import clsx from "clsx";
import ProgressBar from "./ProgressBar";
import {
  FaHashtag,
  FaRegClock,
  FaRegCommentAlt,
} from "react-icons/fa";
import Link from "next/link";
import { GoStar, GoStarFill } from "react-icons/go";
import useWatchlist from "@/app/hooks/useWatchlist";
import { transactionHref } from "@/app/libs/transaction-completion";
import { transactionAccess } from "@/app/libs/listing-capabilities";

const AuctionStatusBar: React.FC = () => {
  const { listing, bids, comments, remainingMs, timeLeft, viewerId, display, finalization } = useAuctionView();
  const { watching, isUpdating, toggle } = useWatchlist({
    listingId: listing.id,
    userId: viewerId,
    initialWatching: listing.isWatching,
  });

  const transaction = transactionAccess(listing, viewerId);
  const owner = viewerId === listing.userId;
  const { headline, price, result } = display;
  const live = display.bucket === "live";
  const ended = display.bucket === "results";
  const amountLabel = price.amount !== null ? formatPrice(price.amount) : null;
  const announcedPrice = amountLabel ? ` ${price.label} ${amountLabel}.` : ended ? "" : " Bid amount to be announced.";

  return (
    <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/10">
      <p role="status" aria-atomic="true" className="sr-only">
        {`${headline}.${announcedPrice}${result ? ` ${result}.` : ""}`}
      </p>
      {live && <ProgressBar remainingMs={remainingMs} timeLeft={timeLeft} />}
      <div className="space-y-4 p-5 sm:space-y-6 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className={clsx("rounded-full px-3 py-1 text-xs font-bold", display.tone === "live" ? "bg-amber-400 text-slate-950" : "bg-white/10 text-slate-200")}>
            {display.timer === "countdown" && <span aria-hidden="true">● </span>}{headline}
          </span>
          {!owner && !ended && (
            <button type="button" onClick={toggle} disabled={isUpdating} aria-pressed={watching}
              aria-label="Watch this auction"
              className="rounded-lg p-2 text-2xl text-amber-400 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-50">
              {watching ? <GoStarFill aria-hidden="true" /> : <GoStar aria-hidden="true" />}
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
          <span className="flex items-center gap-2 text-slate-400"><FaRegClock aria-hidden="true" /> Time left</span>
          <span className="font-semibold tabular-nums">{timeLeft || "Calculating…"}</span>
        </div>}
        {display.action === "retry-finalization" ? (
          <Button className="focus-visible:!outline-amber-400" onClick={finalization.retry} disabled={finalization.finalizing}>{finalization.finalizing ? "Finalizing Auction…" : "Retry Finalization"}</Button>
        ) : display.action === "place-bid" ? (
          <Link href="#bids" className="block rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">Place a Bid</Link>
        ) : display.message ? (
          <p className="text-sm leading-6 text-slate-400">{display.message}</p>
        ) : null}
        {transaction?.canComplete && (
          <div className="space-y-3">
            <Link href={transactionHref(listing.id)} className="block rounded-xl bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">{transaction.role === "seller" ? "View Sale Details" : "View Purchase Details"}</Link>
            <p className="text-xs leading-5 text-slate-400">Contact the {transaction.role === "seller" ? "buyer" : "seller"} to agree payment, paperwork, and pickup.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-5 text-sm text-slate-400">
          {display.bucket !== "upcoming" && <Link href="#bids" className="flex items-center gap-2 tabular-nums hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"><FaHashtag aria-hidden="true" />{formatCount(bids.length, "bid")}</Link>}
          <Link href="#comments" className="flex items-center gap-2 tabular-nums hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"><FaRegCommentAlt aria-hidden="true" />{formatCount(comments.length, "comment")}</Link>
        </div>
      </div>
    </section>
  );
};

export default AuctionStatusBar;
