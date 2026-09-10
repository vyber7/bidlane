import Image from "next/image";
import Link from "next/link";
import { Listing } from "@prisma/client";
import { formatAmount } from "@/app/utils/format";
import { CldImage } from "next-cloudinary";

interface SideListingBoxProps {
  auction: Listing;
}

const SideListingBox: React.FC<SideListingBoxProps> = ({ auction }) => {
  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <Link href={`/listing/${auction.id}`} className="grid grid-cols-[6.5rem_1fr]">
        {auction.coverImage ? (
          <CldImage
            src={auction.coverImage}
            alt={`${auction.year} ${auction.make} ${auction.model}`}
            width={208}
            height={160}
            crop="fill"
            gravity="auto"
            className="h-full min-h-24 w-full object-cover"
          />
        ) : (
          <Image
            src="/images/default-vehicle-image.png"
            alt={`${auction.year} ${auction.make} ${auction.model}`}
            width={208}
            height={160}
            className="h-full min-h-24 w-full object-cover"
          />
        )}
        <div className="min-w-0 p-3">
          <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-950 group-hover:text-amber-700">
            {auction.year} {auction.make} {auction.model}
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Sold for
          </p>
          <p className="text-sm font-bold text-slate-950">
            ${auction.currentBid === null ? "—" : formatAmount(auction.currentBid)}
          </p>
        </div>
      </Link>
    </div>
  );
};

export default SideListingBox;
