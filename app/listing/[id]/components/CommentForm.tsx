"use client";

import axios from "axios";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import CommentInput from "./CommentInput";
import { MdSend } from "react-icons/md";

import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { logger } from "@/app/libs/logger";

interface FormProps {
  listingId: string;
}

const Form: React.FC<FormProps> = ({ listingId }) => {
  const { data } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: {
      comment: "",
    },
  });

  const onSubmit: SubmitHandler<FieldValues> = async (formData) => {
    setIsSubmitting(true);
    try {
      await axios.post("/api/comments", { ...formData, listingId });
      reset({ comment: "" });
    } catch (error) {
      logger.error("comment.create_client_failed", error, { listingId });
      toast.error("The comment could not be posted. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative border flex border-gray-300 rounded-md mb-4 has-[:focus]:ring has-[:focus]:ring-gray-500 hover:ring hover:ring-gray-500"
    >
      <CommentInput
        id="comment"
        register={register}
        errors={errors}
        required
        placeholder="Leave a comment"
      />
      {data ? (
        <button type="submit" className="px-2" disabled={isSubmitting}>
          <MdSend className="text-2xl" />
        </button>
      ) : (
        <>
          <button type="submit" className="px-2 text-gray-500 peer" disabled>
            <MdSend className="text-2xl" />
          </button>
          <div className="hidden absolute right-0 top-[-40px] text-rose-500 peer-hover:block">
            Please, log in
          </div>
        </>
      )}
    </form>
  );
};

export default Form;
