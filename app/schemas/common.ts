import { z } from "zod";

export const MAX_INTEGER = 2_147_483_647;

export const listingIdSchema = z.string({ error: "Invalid listing ID" })
  .regex(/^[a-f\d]{24}$/i, "Invalid listing ID");

export function safeIntegerSchema(field: string, options: { allowZero?: boolean } = {}) {
  const minimum = options.allowZero ? 0 : 1;
  // Limit coercion to nonblank strings and numbers. Number(null), Number(false),
  // and Number("") would otherwise silently become zero.
  return z.custom<string | number>(
    (value) => typeof value === "number" || (typeof value === "string" && value.trim() !== ""),
    { error: `${field} must be an integer` },
  ).transform(Number).refine(
    (value) => Number.isSafeInteger(value) && value >= minimum && value <= MAX_INTEGER,
    `${field} must be an integer between ${minimum} and ${MAX_INTEGER}`,
  );
}

export function requiredTextSchema(message: string) {
  return z.string({ error: message }).trim().min(1, message);
}

/** Use a schema with React Hook Form's field-level validate option. */
export function validationMessage(schema: z.ZodType, value: unknown): true | string {
  const result = schema.safeParse(value);
  return result.success ? true : result.error.issues[0].message;
}
