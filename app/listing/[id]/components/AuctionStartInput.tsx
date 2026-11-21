"use client";

import clsx from "clsx";
import type { AuctionStartFormValues } from "@/app/types/forms";
import { FieldErrors, UseFormRegister } from "react-hook-form";

interface AuctionStartInputProps {
  id: keyof AuctionStartFormValues;
  register: UseFormRegister<AuctionStartFormValues>;
  type: string;
  required?: boolean;
  placeholder?: string;
  errors: FieldErrors<AuctionStartFormValues>;
  label: string;
    hint?: string;
  disabled?: boolean;
}

const AuctionStartInput: React.FC<AuctionStartInputProps> = ({
  id,
  register,
  type,
  required = true,
  placeholder,
  errors,
  label,
  hint,
  disabled,
}) => {
  const error = errors[id];
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="w-full md:w-[49%]">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="text-xs text-slate-600">{hint}</p>}
      <input
        id={id}
        autoComplete="off"
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={description || undefined}
        {...register(id, { required, valueAsNumber: id !== "endTime" })}
        placeholder={placeholder}
        className={clsx(
          `w-full p-2 rounded-md form-input border-gray-300 mb-4 focus:ring focus:ring-gray-500 hover:ring hover:ring-gray-500`,
          error && "border-rose-500 focus:ring-rose-500",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        name={id}
        disabled={disabled}
        required={required}
      />
      {error?.message && <p id={`${id}-error`} role="alert" className="text-sm text-rose-700">{error.message}</p>}
    </div>
  );
};

export default AuctionStartInput;
