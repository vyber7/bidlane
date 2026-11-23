import getCurrentUser from "@/app/actions/getCurrentUser";
import { apiErrorResponse, errorResponse, parseApiInput, readJsonObject, requireListingId } from "@/app/libs/api-request";
import { getNativeRepositories } from "@/app/libs/native-repositories";
import { logger } from "@/app/libs/logger";
import { completionSteps } from "@/app/libs/transaction-completion";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };
const confirmationSchema = z.object({
  step: z.enum(completionSteps.map(({ id }) => id)),
  completed: z.boolean(),
}).strict();

async function handle(request: Request, context: Context, update: boolean) {
  let listingId: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user?.id) return errorResponse("Unauthorized", 401);
    listingId = requireListingId((await context.params).id);
    const repository = getNativeRepositories().completion;
    let result;
    if (update) {
      const body = parseApiInput(confirmationSchema, await readJsonObject(request));
      result = await repository.confirm(listingId, user.id, body.step, body.completed, new Date());
    } else {
      result = await repository.find(listingId, user.id);
    }
    if (!result) return errorResponse("Sold transaction not found", 404);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = apiErrorResponse(error);
    if (response) return response;
    logger.error("transaction.completion_failed", error, { listingId });
    return errorResponse("Unable to load or update the checklist. Please try again.", 500);
  }
}

export const GET = (request: Request, context: Context) => handle(request, context, false);
export const PATCH = (request: Request, context: Context) => handle(request, context, true);
