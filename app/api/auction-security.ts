export class AuctionRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AuctionRequestError";
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireListingId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new AuctionRequestError(400, "Invalid listing ID");
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
    throw new AuctionRequestError(400, `${field} must be an integer`);
  }

  const parsed = typeof value === "number" ? value : Number(value);
  const minimum = options.allowZero ? 0 : 1;
  const maximum = 2_147_483_647;

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AuctionRequestError(
      400,
      `${field} must be an integer between ${minimum} and ${maximum}`
    );
  }

  return parsed;
}

export function auctionErrorResponse(error: unknown): Response | null {
  if (error instanceof AuctionRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return null;
}
