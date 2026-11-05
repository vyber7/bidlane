import type { ApiErrorPayload } from "@/app/types/api";
import type { z } from "zod";
import { listingIdSchema, safeIntegerSchema } from "@/app/schemas/common";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const MAX_JSON_BODY_BYTES = 256 * 1024;

/** Count actual streamed bytes; Content-Length can be absent or dishonest. */
export async function readBoundedBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiRequestError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJsonObject(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, maxBytes);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
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
    const response = errorResponse(error.message, error.status);
    if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }

  return null;
}
