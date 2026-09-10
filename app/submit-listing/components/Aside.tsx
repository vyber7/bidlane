import { Listing } from "@prisma/client";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";

import SideListingBox from "@/app/components/SideListingBox";

interface AsideProps {
  auctions: Listing[];
}

const Aside: React.FC<AsideProps> = ({ auctions }) => {
  return (
    <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:sticky lg:top-20">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
        Past auctions
      </p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">Recently sold</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        See what vehicles have recently sold for on BidLane.
      </p>

      {auctions.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {auctions.map((auction) => (
            <SideListingBox key={auction.id} auction={auction} />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-500">
          No sold auctions to show yet.
        </p>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <Link
          href="/past/listings"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-950 transition hover:text-amber-600"
        >
          View all results <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
};

export default Aside;
