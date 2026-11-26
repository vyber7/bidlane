"use client";

import clsx from "clsx";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
  secondary?: boolean;
  danger?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  fullWidth,
  children,
  secondary,
  danger,
  disabled,
  className,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled}
      className={clsx(
        `flex
        justify-center
        items-center
        gap-1
        rounded-md
        px-3
        py-2
        text-xs
        font-semibold
        focus-visible:outline
        focus-visible:outline-2
        focus-visible:outline-offset-2
        md:text-sm
      `,
        disabled && "opacity-50 cursor-default pointer-events-none",
        fullWidth && "w-full",
        secondary
          ? "text-gray-900 hover:bg-gray-100 focus-visible:outline-gray-900"
          : "text-white",
        danger &&
          "bg-rose-500 hover:bg-rose-600 focus-visible:outline-rose-600",
        !secondary &&
          !danger &&
          "bg-slate-700 hover:bg-slate-800 focus-visible:outline-slate-800",
        className
      )}
    >
      {children}
    </button>
  );
};

export default Button;
