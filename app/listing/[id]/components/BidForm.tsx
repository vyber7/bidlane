"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useAuctionContext } from "@/app/context/AuctionContext";
import { getApiErrorMessage } from "@/app/utils/api-error";
import { capitalize, formatAmount } from "@/app/utils/format";
import type { AcceptedBidResponse } from "@/app/types/auction-events";
import type { BidFormValues } from "@/app/types/forms";

const primaryButton = "rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function BidForm({ minimumBid, canBid, currentUserId }: {
  minimumBid: number | null;
  canBid: boolean;
  currentUserId?: string | null;
}) {
  const { listing, acceptBid } = useAuctionContext();
  const router = useRouter();
  const [review, setReview] = useState<{ amount: number; minimumBid: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [acceptedAmount, setAcceptedAmount] = useState<number | null>(null);
  const submitting = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const { register, handleSubmit, reset, setFocus, setValue, formState: { errors } } = useForm<BidFormValues>();
  const minimumChanged = review !== null && review.minimumBid !== minimumBid;
  const leading = !!currentUserId && listing.highestBidderId === currentUserId;

  useEffect(() => {
    if (review) reviewHeading.current?.focus();
    else if (restoreFocus.current) {
      setFocus("bidAmount");
      restoreFocus.current = false;
    }
  }, [review, setFocus]);

  function closeReview() {
    restoreFocus.current = true;
    setReview(null);
  }

  async function confirmBid() {
    // Check again at the moment of confirmation; live events can change the
    // minimum while the bidder is reviewing. Never silently raise their bid.
    if (!review || !canBid || minimumChanged || review.amount < (minimumBid ?? Infinity) || submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setRequestError(null);
    try {
      const response = await axios.post<AcceptedBidResponse>("/api/place-bid", {
        bidAmount: review.amount,
        listingId: listing.id,
      });
      acceptBid(response.data);
      setAcceptedAmount(response.data.bid.amount);
      reset();
      closeReview();
      router.refresh();
      toast.success("Bid placed successfully!");
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, "Error placing bid");
      setRequestError(message);
      closeReview();
      // Recover a price change missed by the live connection. The server still
      // validates the exact confirmed amount if it changes during the request.
      router.refresh();
      toast.error(message);
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-4">
      {(acceptedAmount !== null || leading) && (
        <div role="status" className={`rounded-lg border p-4 text-sm ${leading ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          {acceptedAmount !== null && <p>Your bid of ${formatAmount(acceptedAmount)} was accepted.</p>}
          <p className="font-bold">{leading ? "You’re leading" : "You’ve been outbid"}</p>
          <p>{leading ? "Keep an eye on the auction until it closes." : "Review the current price before bidding again."}</p>
        </div>
      )}
      <form noValidate onSubmit={handleSubmit(({ bidAmount }) => {
        if (!canBid || minimumBid === null || review || submitting.current) return;
        setRequestError(null);
        setReview({ amount: bidAmount, minimumBid });
      })}>
        <label htmlFor="bidAmount" className="block text-sm font-semibold text-slate-950">Your bid amount in dollars</label>
        <p id="bid-minimum" className="mb-2 mt-1 text-sm text-slate-600">
          {minimumBid !== null ? `Minimum next bid: $${formatAmount(minimumBid)}` : "The minimum bid has not been set."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="bidAmount" type="number" inputMode="numeric" placeholder="Your bid ($)"
            min={minimumBid ?? undefined} max={2_147_483_647} step={1}
            aria-invalid={!!errors.bidAmount} aria-describedby={`bid-minimum${errors.bidAmount ? " bid-error" : ""}`}
            {...register("bidAmount", {
              valueAsNumber: true,
              required: "Enter your bid amount.",
              validate: (value) => (Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647) || "Enter a whole dollar amount within the allowed range.",
              min: { value: minimumBid ?? 0, message: `Your bid must be at least $${formatAmount(minimumBid ?? 0)}.` },
            })}
            disabled={!canBid || review !== null || isLoading}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3 font-semibold text-slate-950 focus:border-amber-500 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
          />
          <button type="submit" disabled={!canBid || review !== null || isLoading} className={primaryButton}>Review bid</button>
        </div>
        {errors.bidAmount && <p id="bid-error" role="alert" className="mt-2 text-sm text-rose-700">{errors.bidAmount.message}</p>}
      </form>
      {requestError && <p role="alert" className="text-sm text-rose-700">{requestError}</p>}
      {review && (
        <section aria-labelledby="bid-review-title" aria-busy={isLoading} className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <h3 id="bid-review-title" ref={reviewHeading} tabIndex={-1} className="text-lg font-bold text-slate-950 focus:outline-none">Review your bid</h3>
          <p className="font-semibold text-slate-950">{listing.year} {capitalize(listing.make)} {capitalize(listing.model)}</p>
          <div><p className="text-sm text-slate-600">Your bid</p><p className="text-3xl font-black tracking-tight text-slate-950">${formatAmount(review.amount)}</p></div>
          <p className="text-sm leading-6 text-slate-700">By confirming, you commit to purchasing this vehicle for your bid amount if you win and the reserve is met. Review the listing and arrange any inspection before bidding.</p>
          {!canBid ? (
            <p role="alert" className="text-sm font-semibold text-rose-700">This auction is no longer accepting bids.</p>
          ) : minimumChanged && (
            <p role="alert" className="text-sm font-semibold text-amber-950">The minimum bid changed while you were reviewing. The minimum is now ${formatAmount(minimumBid!)}. Review the updated bid before confirming.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {minimumChanged ? (
              <button type="button" disabled={!canBid || isLoading} className={primaryButton} onClick={() => {
                if (!canBid || minimumBid === null) return;
                const amount = Math.max(review.amount, minimumBid);
                setValue("bidAmount", amount);
                setReview({ amount, minimumBid });
              }}>Review updated bid</button>
            ) : (
              <button type="button" disabled={!canBid || isLoading} className={primaryButton} onClick={confirmBid}>{isLoading ? "Placing bid…" : `Confirm bid of $${formatAmount(review.amount)}`}</button>
            )}
            <button type="button" disabled={isLoading} onClick={closeReview} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50">Edit bid</button>
          </div>
        </section>
      )}
    </div>
  );
}
