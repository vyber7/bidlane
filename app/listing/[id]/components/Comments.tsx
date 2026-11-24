"use client";

import Link from "next/link";
import CommentForm from "./CommentForm";
import CommentBox from "./CommentBox";
import { useAuctionContext } from "@/app/context/AuctionContext";

export default function Comments({ signedIn }: { signedIn: boolean }) {
  const { listing, comments, bids } = useAuctionContext();

  return (
    <section
      id="comments"
      aria-labelledby="comments-heading"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="comments-heading" className="text-2xl font-bold tracking-tight">Comments &amp; Bids</h2>
      <div className="my-4">
        {signedIn ? <CommentForm listingId={listing.id} /> : (
          <Link
            href={{ pathname: "/signin", query: { callbackUrl: `/listing/${listing.id}#comments` } }}
            className="inline-block rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            Sign In to Comment
          </Link>
        )}
      </div>
      <CommentBox comments={comments} bids={bids} />
    </section>
  );
}
