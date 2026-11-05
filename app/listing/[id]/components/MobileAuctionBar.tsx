"use client";

import { useAuctionContext } from "@/app/context/AuctionContext";
import NoReserveBadge from "@/app/components/NoReserveBadge";
import { formatAmount } from "@/app/utils/format";

export default function MobileAuctionBar({ currentUserId }: { currentUserId?: string | null }) {
  const { listing, timeLeft, remainingMs, expired } = useAuctionContext();

  if (listing.status !== "LIVE") return null;

  const amount = listing.currentBid ?? listing.startingBid;
  const owner = currentUserId === listing.userId;
  const minimumBid = listing.currentBid === null
    ? listing.startingBid
    : listing.currentBid + (listing.bidIncrement ?? 0);
  const configured = listing.startingBid !== null && listing.bidIncrement !== null &&
    listing.auctionStartsAt !== null && listing.auctionEndsAt !== null &&
    minimumBid !== null && Number.isSafeInteger(minimumBid) && minimumBid <= 2_147_483_647;
  const canBid = configured && remainingMs !== null && !expired;

  return (
    <section aria-label="Live auction quick actions" className="sticky bottom-0 z-40 border-t border-white/10 bg-slate-950 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-white shadow-[0_-4px_20px_rgba(2,6,23,0.15)] lg:hidden">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:px-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-400">{listing.currentBid === null ? "Starting bid" : "Current bid"}</p>
            <NoReserveBadge isNoReserve={listing.isNoReserve} />
          </div>
          <p className="text-lg font-bold tabular-nums sm:text-xl">{amount === null ? "To be announced" : `$${formatAmount(amount)}`}</p>
          <p className="text-xs tabular-nums text-amber-400">{expired ? "Finalizing results…" : `Time left: ${timeLeft || "Syncing…"}`}</p>
        </div>
        {expired ? (
          <span role="status" className="text-sm font-semibold text-slate-300">Finalizing…</span>
        ) : owner || canBid ? (
          <a href="#bids" className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
            {owner ? "View bids" : "Place a bid"}
          </a>
        ) : (
          <span role="status" className="max-w-28 text-right text-xs text-slate-400">{remainingMs === null ? "Syncing auction…" : "Bidding unavailable"}</span>
        )}
      </div>
    </section>
  );
}
