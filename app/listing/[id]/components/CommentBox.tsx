"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { formatBid, formatDate, formatDisplayName } from "@/app/utils/format";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";

interface CommentBoxProps {
  comments: CommentWithAuthor[];
  bids: BidWithAuthor[];
}

const ACTIVITY_PAGE_SIZE = 25;

const CommentBox = memo(function CommentBox({ comments, bids }: CommentBoxProps) {
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const list = useRef<HTMLOListElement>(null);
  const firstRevealedIndex = useRef<number | null>(null);

  const activity = useMemo(() => [...comments, ...bids]
    .map((item) => ({ item, createdAt: new Date(item.createdAt) }))
    .sort((a, b) => (b.createdAt.getTime() || 0) - (a.createdAt.getTime() || 0)), [comments, bids]);

  useEffect(() => {
    if (firstRevealedIndex.current === null) return;
    const entry = list.current?.children[firstRevealedIndex.current] as HTMLLIElement | undefined;
    entry?.focus();
    firstRevealedIndex.current = null;
  }, [visibleCount]);

  if (!activity.length) {
    return <p className="text-sm text-slate-600">No comments or bids yet.</p>;
  }

  return (
    <>
      <ol ref={list} aria-label="Auction activity, newest first" className="flex min-w-0 flex-col gap-3 md:gap-4">
        {activity.slice(0, visibleCount).map(({ item, createdAt }) => {
          const name = item.user?.name?.trim().split(/\s+/)[0];
          const isComment = "body" in item;

          return (
            <li
              key={`${isComment ? "comment" : "bid"}-${item.id}`}
              tabIndex={-1}
              className="flex min-w-0 scroll-mt-[calc(var(--site-header-height)+1rem)] flex-col gap-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 [content-visibility:auto] [contain-intrinsic-size:auto_5rem]"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{formatDisplayName(name)}</span>
                {Number.isFinite(createdAt.getTime()) && (
                  <time dateTime={createdAt.toISOString()} className="text-xs text-slate-600">
                    {formatDate(createdAt)}
                  </time>
                )}
              </div>
              <div className={clsx("w-fit max-w-full whitespace-pre-wrap rounded-md p-2 [overflow-wrap:anywhere]", {
                "bg-sky-100": isComment,
                "bg-lime-100 font-bold tabular-nums": !isComment,
              })}>
                {isComment ? item.body?.trim() || "Comment text unavailable." : (
                  <>
                    <span className="font-normal">Bid</span>{" "}
                    {formatBid(item.amount)}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {visibleCount < activity.length && (
        <button
          type="button"
          onClick={() => {
            firstRevealedIndex.current = visibleCount;
            setVisibleCount(visibleCount + ACTIVITY_PAGE_SIZE);
          }}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          Show Older Activity
        </button>
      )}
    </>
  );
});

export default CommentBox;
