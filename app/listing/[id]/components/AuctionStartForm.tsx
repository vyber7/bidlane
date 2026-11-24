"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import { SubmitHandler, useForm } from "react-hook-form";
import AuctionStartInput from "./AuctionStartInput";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useState, useSyncExternalStore } from "react";
import Button from "@/app/components/Button";
import { useRouter } from "next/navigation";
import { logger } from "@/app/libs/logger";
import type { AuctionStartFormValues } from "@/app/types/forms";

interface AuctionStartFormProps {
  listingId: string;
}

const subscribeToTimeZone = () => () => {};
const getLocalTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => null;

const AuctionStartForm: React.FC<AuctionStartFormProps> = ({ listingId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const timeZone = useSyncExternalStore(subscribeToTimeZone, getLocalTimeZone, getServerTimeZone);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AuctionStartFormValues>({
    defaultValues: {
      endTime: "",
      startingBid: 0,
      bidIncrement: 0,
    },
  });

  const onSubmit: SubmitHandler<AuctionStartFormValues> = ({ endTime, ...data }) => {
    const closingTime = new Date(endTime);
    const localTime = new Date(closingTime.getTime() - closingTime.getTimezoneOffset() * 60_000);
    if (!Number.isFinite(localTime.getTime()) || localTime.toISOString().slice(0, 16) !== endTime) {
      setError("endTime", { message: "Choose a valid closing time in your time zone." }, { shouldFocus: true });
      return;
    }
    setIsLoading(true);
    axios
      .post("/api/auction-start", { ...data, endTime: closingTime.toISOString(), listingId })
      .then(() => toast.success("Auction started. Bidding is now open."))
      .catch((error: unknown) => {
        logger.error("auction.start_client_failed", error, { listingId });
        toast.error(getApiErrorMessage(error, "The auction could not be started. Please try again."));
      })
      .finally(() => {
        setIsLoading(false);
        router.refresh();
      });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="p-2 lg:p-4 bg-white border rounded-md shadow-md shadow-gray-400 relative flex flex-wrap gap-2 justify-between"
    >
      <AuctionStartInput
        id="endTime"
        type="datetime-local"
        register={register}
        errors={errors}
        label="End Time"
        hint={timeZone ? `Your device’s time zone is ${timeZone.replaceAll("_", " ")}.` : "Use your device’s local time."}
        disabled={isLoading}
      />
      <AuctionStartInput
        id="startingBid"
        type="number"
        register={register}
        errors={errors}
        label="Starting Bid"
        disabled={isLoading}
      />
      <AuctionStartInput
        id="bidIncrement"
        type="number"
        register={register}
        errors={errors}
        label="Bid Increment"
        disabled={isLoading}
      />
      <Button disabled={isLoading} type="submit" fullWidth>
        {isLoading ? "Starting Auction…" : "Start an Auction"}
      </Button>
    </form>
  );
};

export default AuctionStartForm;
