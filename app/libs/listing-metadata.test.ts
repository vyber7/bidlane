import { describe, expect, it } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { listingMetadata, openGraphImageUrl } from "./listing-metadata";

const photo = "https://res.cloudinary.com/demo/image/upload/v1/listing-abcdef0123456789abcdef01/cover.jpg";

describe("listing metadata", () => {
  it("names the vehicle and summarizes the auction", () => {
    const metadata = listingMetadata(makeListing({ currentBid: 42000, description: "One owner, full service history." }));
    expect(metadata.title).toBe("2020 Porsche 911");
    expect(metadata.description).toBe("Current bid $42,000 · 10,000 miles · New York. One owner, full service history.");
    expect(metadata.alternates?.canonical).toBe("/listing/abcdef0123456789abcdef01");
    expect(metadata.robots).toBeUndefined();
  });

  it("reports the result once the auction has ended", () => {
    expect(listingMetadata(makeListing({ status: "ENDED", result: "SOLD", currentBid: 51000 })).description).toMatch(/^Sold for \$51,000/);
    expect(listingMetadata(makeListing({ status: "ENDED", result: "UNSOLD", currentBid: null })).description).toMatch(/^No bids ·/);
  });

  it("keeps descriptions short and cuts at a word", () => {
    const description = listingMetadata(makeListing({ description: "word ".repeat(100) })).description!;
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/word…$/);
  });

  it("shares a 1200×630 crop of the cover photo, falling back to the first gallery photo", () => {
    const withCover = listingMetadata(makeListing({ coverImage: photo }));
    expect(withCover.openGraph?.images).toEqual([expect.objectContaining({
      url: "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/v1/listing-abcdef0123456789abcdef01/cover.jpg",
      width: 1200, height: 630, alt: "2020 Porsche 911",
    })]);
    expect(withCover.twitter).toEqual(expect.objectContaining({ card: "summary_large_image" }));
    const fromGallery = listingMetadata(makeListing({ images: [photo] }));
    expect(fromGallery.openGraph?.images).toEqual([expect.objectContaining({ url: openGraphImageUrl(photo) })]);
  });

  it("shares no image that isn't one of our Cloudinary uploads", () => {
    const metadata = listingMetadata(makeListing({ coverImage: "https://elsewhere.example/car.jpg" }));
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter).toEqual(expect.objectContaining({ card: "summary" }));
  });

  it("reveals nothing about a Listing before it is public", () => {
    const metadata = listingMetadata(makeListing({ status: "UPCOMING", reviewStatus: "PENDING", coverImage: photo }));
    expect(metadata).toEqual({ title: "Vehicle listing", robots: { index: false, follow: false } });
  });

  it("describes an approved upcoming Listing by its starting bid", () => {
    const metadata = listingMetadata(makeListing({ status: "UPCOMING", reviewStatus: "APPROVED" }));
    expect(metadata.description).toMatch(/^Starting bid \$10,000/);
  });
});
