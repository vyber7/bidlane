"use client";

import clsx from "clsx";
import { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form";

interface AuctionStartInputProps {
  id: string;
  register: UseFormRegister<FieldValues>;
  type: string;
  required?: boolean;
  placeholder?: string;
  errors: FieldErrors;
  label: string;
  disabled?: boolean;
}

const AuctionStartInput: React.FC<AuctionStartInputProps> = ({
  id,
  register,
  type,
  required,
  placeholder,
  errors,
  label,
  disabled,
}) => {
  return (
    <div className="w-full md:w-[49%]">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        autoComplete={id}
        type={type}
        {...register(id, { required })}
        placeholder={placeholder}
        className={clsx(
          `w-full p-2 rounded-md form-input border-gray-300 mb-4 focus:ring focus:ring-gray-500 hover:ring hover:ring-gray-500`,
          errors[id] && "border-rose-500 focus:ring-rose-500",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        name={id}
        disabled={disabled}
        required
      />
      {errors[id] && <span>{errors[id].message as string}</span>}
    </div>
  );
};

export default AuctionStartInput;
