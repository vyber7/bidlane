import type { ApiErrorPayload } from "@/app/types/api";

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
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new ApiRequestError(400, "Invalid listing ID");
  }

  return value;
}

export function requireSafeInteger(
  value: unknown,
  field: string,
  options: { allowZero?: boolean } = {}
): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new ApiRequestError(400, `${field} must be an integer`);
  }

  const parsed = typeof value === "number" ? value : Number(value);
  const minimum = options.allowZero ? 0 : 1;
  const maximum = 2_147_483_647;

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiRequestError(
      400,
      `${field} must be an integer between ${minimum} and ${maximum}`
    );
  }

  return parsed;
}

export function apiErrorResponse(error: unknown): Response | null {
  if (error instanceof ApiRequestError) {
    return errorResponse(error.message, error.status);
  }

  return null;
}
