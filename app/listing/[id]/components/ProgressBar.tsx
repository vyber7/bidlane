// This component will display a bar indicating the ending time of an auction.
"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { pusherClient } from "@/app/libs/pusher";

interface ProgressBarProps {
  endTime: Date | null;
  listingId: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ endTime, listingId }) => {
  const [currentEndTime, setCurrentEndTime] = useState<Date | null>(endTime);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const distance = remainingMs ?? 0;
  const isVisible = distance <= 2 * 60 * 1000 && distance > 0;
  const width = currentEndTime
    ? Math.max(
        0,
        Math.min(
          100,
          (distance / (2 * 60 * 1000)) * 100
        )
      )
    : 0; // 2 minutes total

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(
        currentEndTime ? currentEndTime.getTime() - Date.now() : null
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [currentEndTime]);

  useEffect(() => {
    if (!listingId) return;

    pusherClient.subscribe(`listing-${listingId}`);

    const endTimeHandler = (data: { newEndTime: Date }) => {
      const newEndTime = new Date(data.newEndTime);
      setCurrentEndTime(newEndTime);
      setRemainingMs(newEndTime.getTime() - Date.now());
    };

    pusherClient.bind("new-end-time", endTimeHandler);

    return () => {
      pusherClient.unsubscribe(`listing-${listingId}`);
      pusherClient.unbind("new-end-time", endTimeHandler);
    };
  }, [listingId]);

  return (
    <div
      aria-label="Auction closing progress"
      className={clsx(
        isVisible ? "block" : "hidden",
        "w-full bg-red-100 rounded-t-md"
      )}
    >
      <div
        style={{ width: `${Math.round(width)}%` }}
        className={clsx(
          isVisible ? "block" : "hidden",
          "h-1 bg-red-500 rounded-tl-md"
        )}
      ></div>
    </div>
  );
};
export default ProgressBar;
