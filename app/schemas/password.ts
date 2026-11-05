import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;
export const PASSWORD_REQUIREMENTS = `Use at least ${MIN_PASSWORD_LENGTH} characters and no more than ${MAX_PASSWORD_BYTES} UTF-8 bytes.`;

// bcrypt ignores input beyond 72 UTF-8 bytes, not 72 characters:
// https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns
// Keep this browser-safe and preserve passwords exactly as entered.
export const passwordInputSchema = z.string().refine(
  (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
  `Use no more than ${MAX_PASSWORD_BYTES} bytes. Some characters use more than one byte.`,
);

export const newPasswordSchema = passwordInputSchema.min(
  MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
);
