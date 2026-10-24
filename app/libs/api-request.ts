import type { ApiErrorPayload } from "@/app/types/api";
import type { z } from "zod";
import { listingIdSchema, safeIntegerSchema } from "@/app/schemas/common";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiRequestError(400, "Invalid JSON body");
    }
    throw error;
  }

  if (!isJsonObject(body)) {
    throw new ApiRequestError(400, "Invalid request body");
  }
  return body;
}

export function errorResponse(message: string, status = 500): Response {
  return Response.json({ error: message } satisfies ApiErrorPayload, { status });
}

export function requireListingId(value: unknown): string {
  return parseApiInput(listingIdSchema, value);
}

export function requireSafeInteger(
  value: unknown,
  field: string,
  options: { allowZero?: boolean } = {}
): number {
  return parseApiInput(safeIntegerSchema(field, options), value);
}

/** Only validation at a request boundary becomes a 400; internal errors stay 500s. */
export function parseApiInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiRequestError(400, result.error.issues[0].message);
  }
  return result.data;
}

export function apiErrorResponse(error: unknown): Response | null {
  if (error instanceof ApiRequestError) {
    return errorResponse(error.message, error.status);
  }

  return null;
}
