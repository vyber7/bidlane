import { getNativeRepositories } from "../libs/native-repositories";
import { logger } from "../libs/logger";

async function getComments(listingId: string) {
  try {
    if (!listingId) {
      throw new Error("Listing ID is required");
    }

    return await getNativeRepositories().comments.list(listingId);
  } catch (error) {
    logger.error("comments.fetch_failed", error, { listingId });
    return [];
  }
}

export default getComments;
