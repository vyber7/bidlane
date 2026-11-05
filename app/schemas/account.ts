import { z } from "zod";
import { requiredTextSchema } from "./common";
import { newPasswordSchema, passwordInputSchema } from "./password";
import { normalizeEmail } from "@/app/utils/email";

const registrationRequired = "Name, email, and password are required";

export const loginCredentialsSchema = z.object({
  email: z.string().trim().min(1).max(254),
  // Existing short passwords can still sign in; the minimum applies to new passwords.
  password: passwordInputSchema.min(1),
});

export const registrationSchema = z.object({
  name: requiredTextSchema(registrationRequired).max(60, "Name must be 60 characters or fewer"),
  email: requiredTextSchema(registrationRequired).max(254, "Email must be 254 characters or fewer").pipe(
    z.email({ pattern: z.regexes.html5Email, error: "Please enter a valid email address" }),
  ).transform(normalizeEmail),
  // Passwords are deliberately not trimmed or otherwise transformed.
  password: z.string({ error: registrationRequired }).min(1, registrationRequired).pipe(newPasswordSchema),
});

export const profileSchema = z.object({
  name: z.string({ error: "Name must be between 2 and 60 characters" }).trim()
    .refine((name) => name.length >= 2 && name.length <= 60, "Name must be between 2 and 60 characters"),
  image: z.string({ error: "Invalid image" }).refine((image) => image.length <= 2048, "Invalid image").refine((image) => {
    if (!image) return true;
    try {
      return new URL(image).protocol === "https:";
    } catch {
      return false;
    }
  }, "Invalid image URL"),
});
