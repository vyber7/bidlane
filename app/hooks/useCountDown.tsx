// Hook for countdown timer
import { useEffect, useState } from "react";
import usePusherEvent from "./usePusherEvent";

const useCountDown = (targetDate: Date, listingId?: string) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [targetDateState, setTargetDateState] = useState<Date>(targetDate);

  useEffect(() => {
    if (!targetDateState) {
      return;
    }
    const interval = setInterval(() => {
      const now = new Date();
      const distance = targetDateState.getTime() - now.getTime();

      if (distance <= 0) {
        setTimeLeft("ENDING...");
        clearInterval(interval);
        return;
      }
      const weeks = Math.floor(distance / (1000 * 60 * 60 * 24 * 7));
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      if (weeks > 0) {
        setTimeLeft(`${weeks}w ${days % 7}d ${hours}h ${minutes}m ${seconds}s`);
      } else if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDateState]);

  usePusherEvent<{ newEndTime: Date }>(
    listingId ? `listing-${listingId}` : null,
    "new-end-time",
    (data) => {
      const newEndTime = new Date(data.newEndTime);
      setTargetDateState(newEndTime);
    }
  );

  return timeLeft;
};

export default useCountDown;
