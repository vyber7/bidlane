import Link from "next/link";
import { formatBid, formatDisplayName } from "@/app/utils/format";
import type { RecentBid } from "@/prisma/reads/repositories";

export default function LatestBids({ bids }: { bids: RecentBid[] }) {
  return (
    <section aria-labelledby="latest-bids-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 id="latest-bids-title" className="text-lg font-bold tracking-tight text-slate-950">
          Latest bids
        </h2>
        {bids.length ? (
          <ol className="mt-3 grid auto-cols-[min(76%,15rem)] grid-flow-col grid-rows-2 gap-x-4 gap-y-3 overflow-x-auto pb-1 [scrollbar-width:thin] lg:grid-flow-row lg:grid-cols-5 lg:grid-rows-none">
            {bids.map((bid) => (
              <li key={bid.id} className="min-w-0 break-words border-l-2 border-amber-400 pl-3">
                <p className="text-xs text-slate-600">
                  <strong className="text-sm tabular-nums text-slate-950">{formatBid(bid.amount)}</strong>
                  {" by "}{formatDisplayName(bid.bidderName, "Bidder")}
                </p>
                <Link
                  href={`/listing/${bid.listingId}`}
                  className="rounded-sm text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-amber-700 focus-visible:outline-amber-600"
                >
                  {bid.auctionTitle}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-slate-600">No bids yet.</p>
        )}
      </div>
    </section>
  );
}
