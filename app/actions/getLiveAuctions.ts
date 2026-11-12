import { getReadRepositories } from "@/app/libs/read-repositories";
import { logger } from "@/app/libs/logger";
import { toPublicListing } from "@/app/libs/listing-payload";

async function getLiveAuctions() {
  try {
    const liveAuctions = await getReadRepositories().listings.live();
    return liveAuctions.map((listing) => toPublicListing(listing));
  } catch (error) {
    logger.error("auctions.live_fetch_failed", error);
    return [];
  }
}
export default getLiveAuctions;
