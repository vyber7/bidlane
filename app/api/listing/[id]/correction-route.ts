import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { logger } from "@/app/libs/logger";
import { correctListing, type Correction, type CorrectionResult } from "@/app/libs/listing-correction";

type RequestBody = Record<string, unknown>;

/**
 * Builds a route handler that sends one kind of Correction through the
 * Correction operation for the signed-in seller.
 */
export function correctionRoute({ correction, respond, failure }: {
  /** Reads this kind of Correction from the request body. */
  correction: (body: RequestBody) => Correction;
  /** The success body for this route's clients. */
  respond: (result: CorrectionResult, body: RequestBody) => RequestBody;
  /** The log event and retry message for an unexpected failure. */
  failure: { event: string; message: string };
}) {
  return async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    let listingId: string | undefined;
    try {
      const user = await getCurrentUser();
      if (!user) return errorResponse("Please sign in.", 401);
      listingId = requireListingId((await params).id);
      const body = await readJsonObject(request);
      const result = await correctListing({ listingId, sellerId: user.id }, correction(body));
      return Response.json(respond(result, body));
    } catch (error) {
      const response = apiErrorResponse(error);
      if (response) return response;
      logger.error(failure.event, error, { listingId });
      return errorResponse(failure.message, 500);
    }
  };
}
