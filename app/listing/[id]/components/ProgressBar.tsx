// Shows how much of the Extension window is left before the Auction closes.
"use client";
import { EXTENSION_WINDOW_MS } from "@/app/libs/auction-lifecycle";

interface ProgressBarProps {
  remainingMs: number | null;
  timeLeft?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ remainingMs, timeLeft }) => {
  const distance = remainingMs ?? 0;
  if (distance <= 0 || distance > EXTENSION_WINDOW_MS) return null;
  const percent = Math.round(Math.max(0, Math.min(100, (distance / EXTENSION_WINDOW_MS) * 100)));

  return (
    <div
      role="progressbar"
      aria-label="Auction closing progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={timeLeft ? `${timeLeft} left` : undefined}
      className="w-full rounded-t-md bg-red-100"
    >
      <div style={{ width: `${percent}%` }} className="h-1 rounded-tl-md bg-red-500" />
    </div>
  );
};
export default ProgressBar;
