// This component will display a bar indicating the ending time of an auction.
"use client";
import clsx from "clsx";
import { EXTENSION_WINDOW_MS } from "@/app/libs/auction-lifecycle";

interface ProgressBarProps {
  remainingMs: number | null;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ remainingMs }) => {
  const distance = remainingMs ?? 0;
  const isVisible = distance <= EXTENSION_WINDOW_MS && distance > 0;
  const width = Math.max(0, Math.min(100, (distance / EXTENSION_WINDOW_MS) * 100));

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
