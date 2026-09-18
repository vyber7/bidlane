"use client";

import { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form";
import clsx from "clsx";

interface CommentInputProps {
  id: string;
  register: UseFormRegister<FieldValues>;
  type?: string;
  required?: boolean;
  placeholder?: string;
  errors: FieldErrors;
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
