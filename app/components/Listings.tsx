"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { updateInventoryParams, type inventoryPage } from "@/app/libs/auction-inventory";
import ListingBox from "./ListingBox";

interface ListingsProps {
  resultsPage: ReturnType<typeof inventoryPage>;
  currentUserId?: string | null;
  onPageChange: (page: number) => void;
}

const paginationButtonClass = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-disabled:cursor-default aria-disabled:bg-slate-100 aria-disabled:text-slate-600";

// A real link, so Cmd/Ctrl/middle-click opens the page; plain clicks stay in-page.
function PageLink({ page, onPageChange, children }: { page: number | null; onPageChange: (page: number) => void; children: ReactNode }) {
  const searchParams = useSearchParams();
  if (page === null) return <a role="link" aria-disabled="true" className={paginationButtonClass}>{children}</a>;

  const query = updateInventoryParams(searchParams, { page }).toString();
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onPageChange(page);
  };
  return <Link href={`/${query ? `?${query}` : ""}#auctions`} scroll={false} onClick={onClick} className={paginationButtonClass}>{children}</Link>;
}

const Listings: React.FC<ListingsProps> = ({ resultsPage, currentUserId, onPageChange }) => {
  const { listings, page, pageCount, previousPage, nextPage } = resultsPage;

  return (
    <>
      {pageCount > 1 && (
        <nav aria-label="Auction pages" className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <PageLink page={previousPage} onPageChange={onPageChange}>Previous Page</PageLink>
          <p role="status" className="text-sm tabular-nums text-slate-600">Page {page} of {pageCount}</p>
          <PageLink page={nextPage} onPageChange={onPageChange}>Next Page</PageLink>
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
