import { NextResponse } from "next/server";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, readJsonObject, errorResponse, parseApiInput } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { bidIdempotencyKeySchema, bidRequestSchema } from "@/app/schemas/auction";
import { placeBid, type BidRejection } from "@/app/libs/auction-commands";

const rejections = {
  "key-reused": [409, "Idempotency-Key was already used for a different bid"],
  unverified: [403, "Verify your email in Account → Profile before you bid."],
  "not-found": [404, "Listing not found"],
  "own-listing": [403, "Sellers cannot bid on their listing"],
  "not-open": [409, "Auction is not open for bidding"],
  unconfigured: [409, "Auction bidding is not configured"],
  "limit-reached": [409, "Auction cannot accept a higher bid"],
  outpaced: [409, "The auction changed while placing this bid; please try again"],
  busy: [503, "Bidding is busy; retry this same request"],
} as const satisfies Record<Exclude<BidRejection["reason"], "below-minimum">, readonly [number, string]>;

function rejectionResponse(rejection: BidRejection) {
  if (rejection.reason === "below-minimum") return errorResponse(`Bid must be at least ${rejection.minimumBid}`, 400);
  const [status, message] = rejections[rejection.reason];
  return errorResponse(message, status);
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id || !currentUser?.email)
      return errorResponse("Unauthorized", 401);

    const { listingId, bidAmount } = parseApiInput(bidRequestSchema, await readJsonObject(req, 4096));
    const key = parseApiInput(bidIdempotencyKeySchema, req.headers.get("Idempotency-Key"));

    const outcome = await placeBid({ bidder: currentUser, listingId, amount: bidAmount, key });
    if (!outcome.ok) return rejectionResponse(outcome);
    return NextResponse.json(outcome.response, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("bid.place_failed", error);
    return errorResponse("Internal Server Error", 500);
  }
}
