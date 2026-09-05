"use client";

import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import AuctionStartInput from "./AuctionStartInput";
import axios from "axios";
import { toast } from "react-hot-toast";
import { now } from "lodash";
import { useState } from "react";
import Button from "@/app/components/Button";
import { useRouter } from "next/navigation";
import { logger } from "@/app/libs/logger";

interface AuctionStartFormProps {
  listingId: string;
}

const AuctionStartForm: React.FC<AuctionStartFormProps> = ({ listingId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: {
      startTime: new Date(now()),
      endTime: new Date(now()),
      startingBid: 0,
      bidIncrement: 0,
    },
  });

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);
    axios
      .post("/api/auction-start", { ...data, listingId })
      .catch((error) => {
        logger.error("auction.start_client_failed", error, { listingId });
        toast.error("The auction could not be started. Please try again.");
      })
      .finally(() => {
        setIsLoading(false);
        router.refresh();
      });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="p-4 bg-white border rounded-md shadow-md shadow-gray-400 relative flex flex-wrap gap-2 justify-between"
    >
      {/* <AuctionStartInput
        id="startTime"
        type="datetime-local"
        register={register}
        errors={errors}
        label="Start Time"
      /> */}
      <AuctionStartInput
        id="endTime"
        type="datetime-local"
        register={register}
        errors={errors}
        label="End Time"
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
        Start an Auction
      </Button>
    </form>
  );
};

export default AuctionStartForm;
