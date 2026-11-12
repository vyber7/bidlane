import { getReadRepositories } from "../libs/read-repositories";
import { logger } from "../libs/logger";

const getBids = async (listingId: string) => {
  try {
    return await getReadRepositories().bids.forListing(listingId);
  } catch (error: unknown) {
    logger.error("bids.fetch_failed", error, { listingId });
    return [];
  }
};

export default getBids;
