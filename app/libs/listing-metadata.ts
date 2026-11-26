import type { Metadata } from "next";
import type { Listing } from "@/app/types/database";
import { auctionPrice } from "./auction-lifecycle";
import { isPublicListing } from "./listing-review-rules";
import { isCloudinaryImageUrl } from "@/app/schemas/listing";
import { formatAmount, formatPrice } from "@/app/utils/format";

type MetadataListing = Pick<Listing,
  "id" | "year" | "make" | "model" | "miles" | "location" | "description" | "coverImage" | "images"
  | "status" | "reviewStatus" | "result" | "startingBid" | "currentBid">;

const DESCRIPTION_LENGTH = 160;
const OG_WIDTH = 1200, OG_HEIGHT = 630;

/** Metadata for a Listing nobody outside its seller and admins may see yet. */
export const hiddenListingMetadata: Metadata = {
  title: "Vehicle listing",
  robots: { index: false, follow: false },
};

/** Cut at a word boundary so search results never end mid-word. */
function truncate(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:–—-]+$/, "")}…`;
}

/**
 * A 1200×630 JPEG crop of a Cloudinary photo. Link previews expect that ratio,
 * and some crawlers can't read the WebP or AVIF that f_auto would pick.
 */
export function openGraphImageUrl(url: string) {
  return url.replace("/image/upload/", `/image/upload/c_fill,g_auto,w_${OG_WIDTH},h_${OG_HEIGHT},f_jpg,q_auto/`);
}

export function listingTitle(listing: Pick<Listing, "year" | "make" | "model">) {
  return `${listing.year} ${listing.make} ${listing.model}`;
}

/** Search and link-preview metadata for one Listing, exposing nothing before it is public. */
export function listingMetadata(listing: MetadataListing): Metadata {
  if (!isPublicListing(listing)) return hiddenListingMetadata;

  const title = listingTitle(listing);
  const { label, amount } = auctionPrice(listing);
  const facts = [
    amount === null ? label : `${label} ${formatPrice(amount)}`,
    `${formatAmount(listing.miles)} miles`,
    listing.location,
  ].filter(Boolean).join(" · ");
  const summary = `${facts}.`;
  const description = truncate(`${summary} ${listing.description}`, DESCRIPTION_LENGTH);

  const photo = [listing.coverImage, ...listing.images].find((url) => isCloudinaryImageUrl(url));
  const images = photo ? [{ url: openGraphImageUrl(photo), width: OG_WIDTH, height: OG_HEIGHT, alt: title }] : undefined;
  const path = `/listing/${listing.id}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "BidLane", url: path, title, description, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map(({ url }) => url) },
  };
}
