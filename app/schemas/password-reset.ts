import { z } from "zod";

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email({ error: "Enter a valid email address." })),
});
export const newPasswordSchema = z.string().min(12, "Use at least 12 characters.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "This password is too long. Please use fewer characters.");
export const passwordResetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "This reset link is invalid. Request a new one."),
  password: newPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});
