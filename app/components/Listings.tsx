"use client";
import type { PublicListing } from "@/app/libs/listing-payload";
import ListingBox from "./ListingBox";

interface ListingsProps {
  listings: PublicListing[];
  currentUserId?: string | null;
  page: number;
  onPageChange: (page: number) => void;
}

const pageSize = 24;
const paginationButtonClass = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-disabled:cursor-default aria-disabled:bg-slate-100 aria-disabled:text-slate-600";

const Listings: React.FC<ListingsProps> = ({ listings, currentUserId, page, onPageChange }) => {
  if (listings.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <h3 className="font-semibold">No auctions found</h3>
        <p className="mt-1 text-sm text-gray-600">
          Check back soon for newly listed vehicles.
        </p>
      </div>
    );
  }

  const pageCount = Math.ceil(listings.length / pageSize);
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageListings = listings.slice(start, start + pageSize);

  return (
    <>
      {pageCount > 1 && (
        <nav aria-label="Auction pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" aria-disabled={currentPage === 1} className={paginationButtonClass}
            onClick={() => { if (currentPage > 1) onPageChange(currentPage - 1); }}>
            Previous Page
          </button>
          <p role="status" className="text-sm tabular-nums text-slate-600">Page {currentPage} of {pageCount}</p>
          <button type="button" aria-disabled={currentPage === pageCount} className={paginationButtonClass}
            onClick={() => { if (currentPage < pageCount) onPageChange(currentPage + 1); }}>
            Next Page
          </button>
        </nav>
      )}
      <ul className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageListings.map((listing) => (
          <li
            key={listing.id}
            className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/10"
          >
            <ListingBox listing={listing} currentUserId={currentUserId} />
          </li>
        ))}
      </ul>
    </>
  );
};

export default Listings;
