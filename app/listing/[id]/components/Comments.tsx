"use client";

import Form from "./CommentForm";
import CommentBox from "./CommentBox";
import { useAuctionContext } from "@/app/context/AuctionContext";

export default function Comments() {
  const { listing, comments, bids } = useAuctionContext();

  return (
    <div
      id="comments"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 className="pb-4 text-2xl font-bold tracking-tight">Comments & bids</h2>
      <Form listingId={listing.id} />
      <CommentBox comments={comments} bids={bids} />
    </div>
  );
}
