"use client";

import type { Listing } from "@prisma/client";
import Link from "next/link";
import { CldImage } from "next-cloudinary";
import { FiArrowUpRight, FiCamera } from "react-icons/fi";
import useAuction from "@/app/hooks/useAuction";
import WatchAuctionButton from "./WatchAuctionButton";
import { formatAmount } from "@/app/utils/format";

export default function FeaturedAuction({ listing: initialListing, currentUserId }: {
  listing: Listing;
  currentUserId?: string | null;
}) {
  const { listing, expired, timeLeft } = useAuction(initialListing);
  const title = `${listing.year} ${listing.make} ${listing.model}`;
  const href = `/listing/${listing.id}`;
  const image = listing.coverImage || listing.images[0];
  const upcoming = listing.status === "UPCOMING";
  const live = listing.status === "LIVE";
  const sold = listing.status === "ENDED" && listing.result === "SOLD";
  const amount = listing.currentBid ?? (live ? listing.startingBid : null);

  return (
    <article aria-label={`Featured vehicle: ${title}`} className="relative isolate min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-slate-800 shadow-xl shadow-black/10">
      <Link href={href} aria-label={`View ${title}`} className="group absolute inset-0 block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400">
        {image ? (
          <CldImage src={image} alt={title} fill sizes="(min-width: 1152px) 520px, (min-width: 1024px) 45vw, 100vw" crop="fill" loading="eager" fetchPriority="high" className="object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <div className="absolute inset-x-0 top-16 flex flex-col items-center justify-center gap-2 text-sm text-slate-400"><FiCamera size={28} aria-hidden="true" />Photos coming soon</div>
        )}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-slate-950/90 px-3 py-1.5 text-xs font-bold text-amber-400">
          {upcoming ? "Coming soon" : live ? expired ? "Bidding closed" : "Live auction" : "Recent result"}
        </span>
        <span aria-hidden="true" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-950 transition group-hover:bg-amber-400"><FiArrowUpRight size={18} /></span>
      </Link>
      <div className="pointer-events-none relative mt-44 p-4 sm:mt-48 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <Link href={href} className="block rounded-sm hover:text-amber-400 focus-visible:outline-amber-400">
          <h2 className="text-lg font-bold leading-6 tracking-tight">{title}</h2>
        </Link>
        <p className="mt-1 text-xs text-slate-300">{listing.miles.toLocaleString("en-US")} miles · {listing.location}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <p className="text-xs leading-5 text-slate-300">
            {upcoming ? <>Watch it now.<br /><span className="text-white">Be ready when bidding opens.</span></> : <>
              {sold ? "Sold for" : live ? listing.currentBid === null ? "Starting bid" : "Current bid" : "Highest bid"}{" "}
              <strong className="text-base tabular-nums text-white">{amount === null ? "—" : `$${formatAmount(amount)}`}</strong>
              <span className="block text-amber-400">{live ? expired ? "Auction closing" : timeLeft ? `${timeLeft} left` : "Live bidding" : sold ? "Auction complete" : listing.currentBid === null ? "No bids placed" : "Reserve not met"}</span>
            </>}
          </p>
          {upcoming ? <WatchAuctionButton key={listing.id} listing={listing} currentUserId={currentUserId} /> : (
            <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300">{live ? "View auction" : "View result"}<FiArrowUpRight aria-hidden="true" /></Link>
          )}
        </div>
      </div>
    </article>
  );
}
