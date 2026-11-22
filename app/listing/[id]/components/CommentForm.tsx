"use client";

import { getApiErrorMessage } from "@/app/utils/api-error";

import axios from "axios";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useId, useRef, useState } from "react";
import { FiLoader } from "react-icons/fi";
import { logger } from "@/app/libs/logger";
import { useAuctionContext } from "@/app/context/AuctionContext";
import type { CommentResponse } from "@/app/types/auction-events";
import type { CommentFormValues } from "@/app/types/forms";
import { commentRequestSchema, MAX_COMMENT_LENGTH } from "@/app/schemas/auction";
import { validationMessage } from "@/app/schemas/common";

export default function CommentForm({ listingId }: { listingId: string }) {
  const { acceptComment } = useAuctionContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postError, setPostError] = useState("");
  const [posted, setPosted] = useState(false);
  const submitting = useRef(false);
  const inputId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CommentFormValues>({
    defaultValues: {
      comment: "",
    },
  });

  const onSubmit: SubmitHandler<CommentFormValues> = async (formData) => {
    if (submitting.current) return;
    submitting.current = true;
    setPostError("");
    setPosted(false);
    setIsSubmitting(true);
    try {
      const response = await axios.post<CommentResponse>("/api/comments", { ...formData, listingId });
      acceptComment(response.data.comment);
      reset({ comment: "" });
      setPosted(true);
    } catch (error) {
      logger.error("comment.create_client_failed", error, { listingId });
      setPostError(getApiErrorMessage(error, "The comment could not be posted. Please try again."));
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        if (submitting.current) {
          event.preventDefault();
          return;
        }
        void handleSubmit(onSubmit, () => {
          setPostError("");
          setPosted(false);
        })(event);
      }}
      className="space-y-2"
    >
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-950">Your Comment</label>
      <textarea
        id={inputId}
        rows={3}
        autoComplete="off"
        maxLength={MAX_COMMENT_LENGTH}
        readOnly={isSubmitting}
        aria-required="true"
        aria-invalid={Boolean(errors.comment)}
        aria-describedby={errors.comment || postError ? `${inputId}-error` : undefined}
        {...register("comment", {
          validate: (value) => validationMessage(commentRequestSchema.shape.comment, value),
        })}
        className="block w-full scroll-mt-[calc(var(--site-header-height)+1rem)] rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 aria-[invalid=true]:border-rose-600"
      />
      {(errors.comment || postError) && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-rose-700">
          {errors.comment?.message || postError}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={isSubmitting}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 aria-disabled:cursor-wait aria-disabled:opacity-60"
      >
        {isSubmitting ? <><FiLoader aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Posting…</> : "Post Comment"}
      </button>
      <p role="status" className="sr-only">{isSubmitting ? "Posting comment…" : posted ? "Comment posted." : ""}</p>
    </form>
  );
}
