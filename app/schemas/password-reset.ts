import { z } from "zod";
import { newPasswordSchema } from "./password";

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email({ error: "Enter a valid email address." })),
});
export const passwordResetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "This reset link is invalid. Request a new one."),
  password: newPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});
