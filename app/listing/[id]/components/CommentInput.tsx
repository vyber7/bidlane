"use client";

import { FieldErrors, UseFormRegister } from "react-hook-form";
import clsx from "clsx";
import type { CommentFormValues } from "@/app/types/forms";

interface CommentInputProps {
  id: keyof CommentFormValues;
  register: UseFormRegister<CommentFormValues>;
  type?: string;
  required?: boolean;
  placeholder?: string;
  errors: FieldErrors<CommentFormValues>;
}

const CommentInput: React.FC<CommentInputProps> = ({
  id,
  register,
  type,
  required,
  placeholder,
  errors,
}) => {
  return (
    <input
      id={id}
      autoComplete={id}
      {...register(id, { required })}
      type={type}
      placeholder={placeholder}
      className={clsx(
        "w-full rounded-md border-none p-2 form-input focus:ring-transparent placeholder:text-gray-400",
        errors[id] && "ring-2 ring-red-500"
      )}
    />
  );
};

export default CommentInput;
