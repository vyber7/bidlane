"use client";
import Form from "./CommentForm";
import { Bid } from "@prisma/client";
import { useRef, useState } from "react";
import { find } from "lodash";
import CommentBox from "./CommentBox";
import usePusherEvent from "@/app/hooks/usePusherEvent";
import type { CommentWithAuthor } from "@/app/types";

interface CommentsProps {
  initialComments: CommentWithAuthor[];
  initialBids: (Bid & { user: { name: string | null } })[];
  listingId: string;
}

const Comments: React.FC<CommentsProps> = ({
  initialComments,
  initialBids,
  listingId,
}) => {
  const [comments, setComments] = useState(initialComments);
  const [bids, setBids] = useState(initialBids);
  const topRef = useRef<HTMLDivElement>(null);

  usePusherEvent<CommentWithAuthor>(
    `listing-${listingId}`,
    "new-comment",
    (comment) => {
      setComments((current) => {
        if (find(current, { id: comment.id })) {
          return current;
        }

        return [comment, ...current];
      });
    }
  );

  usePusherEvent<Bid & { user: { name: string | null } }>(
    `listing-${listingId}`,
    "new-bid",
    (bid) => {
      setBids((current) => {
        if (find(current, { id: bid.id })) {
          return current;
        }

        return [bid, ...current];
      });
    }
  );

  return (
    <div
      id="comments"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 className="pb-4 text-2xl font-bold tracking-tight">Comments & bids</h2>
      <Form listingId={listingId} />
      <div ref={topRef}></div>
      <CommentBox comments={comments} bids={bids} />
    </div>
  );
};

export default Comments;
