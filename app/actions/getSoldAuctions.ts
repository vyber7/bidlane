import { getReadRepositories } from "@/app/libs/read-repositories";
import { logger } from "@/app/libs/logger";
import { toPublicListing } from "@/app/libs/listing-payload";

async function getSoldAuctions() {
  try {
    const soldAuctions = await getReadRepositories().listings.sold();
    return soldAuctions.map((listing) => toPublicListing(listing));
  } catch (error) {
    logger.error("auctions.sold_fetch_failed", error);
    return [];
  }
}
export default getSoldAuctions;
