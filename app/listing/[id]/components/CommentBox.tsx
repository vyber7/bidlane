"use client";

import clsx from "clsx";
import { formatAmount, formatDisplayName } from "@/app/utils/format";
import type { BidWithAuthor, CommentWithAuthor } from "@/app/types";

interface CommentBoxProps {
  comments: CommentWithAuthor[];
  bids: BidWithAuthor[];
}

const CommentBox: React.FC<CommentBoxProps> = ({ comments, bids }) => {
  const commentsAndBids = [...comments, ...bids];
  commentsAndBids.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <ul className="flex flex-col gap-3 md:gap-4">
      {commentsAndBids.map((item) => {
        let date = new Date(item.createdAt).toDateString();
        date = date.slice(4, 10);
        const name = item.user?.name?.trim().split(/\s+/)[0];

        return (
          <li key={item.id} className="flex flex-col gap-1">
            <div className="flex">
              <div className="pr-2 pb-1 font-bold ">
                {formatDisplayName(name)}
              </div>
              <div className="pl-2 text-gray-400 text-xs transform translate-y-1">
                {date}
              </div>
            </div>
            <div
              className={clsx(`p-2 rounded-md w-fit`, {
                "bg-lime-100 font-bold ring ring-lime-500": !("body" in item),
                "bg-sky-100 ring ring-sky-500": "body" in item,
              })}
            >
              {"body" in item ? (
                item.body
              ) : (
                <>
                  <span className="font-normal">Bid</span>{" "}
                  {`$${formatAmount(item.amount)}`}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default CommentBox;
