"use client";

import type { PublicListing } from "@/app/libs/listing-payload";
import Link from "next/link";
import { CldImage } from "next-cloudinary";
import { FiArrowUpRight, FiCamera } from "react-icons/fi";
import useAuction from "@/app/hooks/useAuction";
import WatchAuctionButton from "./WatchAuctionButton";
import NoReserveBadge from "@/app/components/NoReserveBadge";
import { formatBid } from "@/app/utils/format";
import { auctionPrice, phaseLabel } from "@/app/libs/auction-lifecycle";

export default function FeaturedAuction({ listing: initialListing, currentUserId }: {
  listing: PublicListing;
  currentUserId?: string | null;
}) {
  const { listing, phase, timeLeft } = useAuction(initialListing);
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const href = `/listing/${listing.id}`;
  const image = listing.coverImage || listing.images[0];
  const upcoming = listing.status === "UPCOMING";
  const live = listing.status === "LIVE";
  const closing = phase?.phase === "closing";
  const { label: bidLabel, amount } = auctionPrice(listing);
  const showWatchButton = upcoming && currentUserId !== listing.userId;

  return (
    <article aria-label={`Featured vehicle: ${title}`} className="group relative isolate grid min-w-0 overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl shadow-black/10 lg:grid-cols-[3fr_2fr]">
      <div className="relative aspect-[16/10] bg-slate-900">
        {image ? (
          <CldImage src={image} alt="" fill sizes="(min-width: 1152px) 662px, (min-width: 1024px) 58vw, 100vw" crop="fill" loading="eager" fetchPriority="high" className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.02]" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-400"><FiCamera size={28} aria-hidden="true" />Photos coming soon</div>
        )}
        <span aria-live="polite" aria-atomic="true" className="absolute left-3 top-3 rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-bold text-amber-400">
          <span className="sr-only">{title}: </span>
          {listing.status === "ENDED" ? "Recent result" : phase ? phaseLabel(phase) : "Live auction"}
        </span>
        <span aria-hidden="true" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 transition group-hover:bg-amber-400"><FiArrowUpRight size={18} /></span>
      </div>
      <div className="flex min-w-0 flex-col p-5 sm:p-6 lg:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">Featured auction</p>
        <h2 className="mt-2 break-words text-xl font-bold leading-7 tracking-tight sm:text-2xl sm:leading-8">
          <Link href={href} className="after:absolute after:inset-0 after:z-10 group-hover:text-amber-400 focus-visible:text-amber-400 focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-amber-400">
            {title}
          </Link>
        </h2>
        {listing.isNoReserve && <div className="mt-3"><NoReserveBadge isNoReserve={listing.isNoReserve} /></div>}
        <p className="mt-2 text-sm text-slate-300">{listing.miles.toLocaleString("en-US")} miles · {listing.location}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 lg:mt-auto">
          <div className="text-sm leading-6 text-slate-300">
            <p aria-live="polite" aria-atomic="true">
              {!upcoming && <>
                <span className="sr-only">{title}: </span>
                {bidLabel} <strong className="text-xl tabular-nums text-white">{amount === null ? "—" : formatBid(amount)}</strong>
              </>}
            </p>
            {upcoming
              ? <p>Watch it now.<br /><span className="text-white">Be ready when bidding opens.</span></p>
              : <p className="text-amber-400">{live ? closing ? "Finalizing results…" : timeLeft ? `${timeLeft} left` : "Live bidding" : phase?.phase === "sold" ? "Auction complete" : phase?.phase === "unsold" && phase.reason === "reserve-not-met" ? "Reserve not met" : "No bids placed"}</p>}
          </div>
          {showWatchButton ? (
            <div className="relative z-20">
              <WatchAuctionButton key={listing.id} listing={listing} currentUserId={currentUserId} />
            </div>
          ) : (
            <span aria-hidden="true" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-400">
              {upcoming ? "View your listing" : live ? "View auction" : "View result"}<FiArrowUpRight aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
