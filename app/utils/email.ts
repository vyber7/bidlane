/** Account identity is case-insensitive; do not collapse dots or plus aliases. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
