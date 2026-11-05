import { z } from "zod";
import { requiredTextSchema } from "./common";

const registrationRequired = "Name, email, and password are required";

export const MAX_CREDENTIAL_BYTES = 1024;
export const loginCredentialsSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).refine((value) => new TextEncoder().encode(value).length <= MAX_CREDENTIAL_BYTES),
});

export const registrationSchema = z.object({
  name: requiredTextSchema(registrationRequired).max(60, "Name must be 60 characters or fewer"),
  email: requiredTextSchema(registrationRequired).max(254, "Email must be 254 characters or fewer").pipe(
    z.email({ pattern: z.regexes.html5Email, error: "Please enter a valid email address" }),
  ),
  // Passwords are deliberately not trimmed or otherwise transformed.
  password: z.string({ error: registrationRequired }).min(1, registrationRequired)
    .refine((value) => new TextEncoder().encode(value).length <= MAX_CREDENTIAL_BYTES, "Password input is too long"),
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
