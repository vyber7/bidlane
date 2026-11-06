import type { PublicListing } from "@/app/libs/listing-payload";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";

import SideListingBox from "@/app/components/SideListingBox";

interface AsideProps {
  auctions: PublicListing[];
  variant?: "sold" | "live";
}

const Aside: React.FC<AsideProps> = ({ auctions, variant = "sold" }) => {
  const live = variant === "live";
  return (
    <aside className={`h-fit rounded-2xl border border-slate-200 bg-slate-50 p-5${live ? "" : " lg:sticky lg:top-20"}`}>
      <h2 className="mt-2 text-xl font-bold text-slate-950">
        {live ? "Live auctions" : "Recently sold"}
      </h2>

      {auctions.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {auctions.map((auction) => (
            <SideListingBox
              key={auction.id}
              auction={auction}
              variant={variant}
            />
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-500">
          {live
            ? "No other live auctions to show right now."
            : "No sold auctions to show yet."}
        </p>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <Link
          href={live ? "/?status=live#auctions" : "/?status=ended#auctions"}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-950 transition hover:text-amber-600"
        >
          {live ? "View all live auctions" : "View all results"}{" "}
          <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
};

export default Aside;
