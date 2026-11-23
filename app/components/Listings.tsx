"use client";
import type { inventoryPage } from "@/app/libs/auction-inventory";
import ListingBox from "./ListingBox";

interface ListingsProps {
  resultsPage: ReturnType<typeof inventoryPage>;
  currentUserId?: string | null;
  onPageChange: (page: number) => void;
}

const paginationButtonClass = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-disabled:cursor-default aria-disabled:bg-slate-100 aria-disabled:text-slate-600";

const Listings: React.FC<ListingsProps> = ({ resultsPage, currentUserId, onPageChange }) => {
  const { listings, page, pageCount, previousPage, nextPage } = resultsPage;

  return (
    <>
      {pageCount > 1 && (
        <nav aria-label="Auction pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" aria-disabled={previousPage === null} className={paginationButtonClass}
            onClick={() => { if (previousPage !== null) onPageChange(previousPage); }}>
            Previous Page
          </button>
          <p role="status" className="text-sm tabular-nums text-slate-600">Page {page} of {pageCount}</p>
          <button type="button" aria-disabled={nextPage === null} className={paginationButtonClass}
            onClick={() => { if (nextPage !== null) onPageChange(nextPage); }}>
            Next Page
          </button>
        </nav>
      )}
      <ul className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
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
