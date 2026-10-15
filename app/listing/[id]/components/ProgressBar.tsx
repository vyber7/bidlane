// This component will display a bar indicating the ending time of an auction.
"use client";
import clsx from "clsx";

interface ProgressBarProps {
  remainingMs: number | null;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ remainingMs }) => {
  const distance = remainingMs ?? 0;
  const isVisible = distance <= 2 * 60 * 1000 && distance > 0;
  const width = Math.max(0, Math.min(100, (distance / (2 * 60 * 1000)) * 100));

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
