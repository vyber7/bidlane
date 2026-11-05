import { describe, expect, it } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { publicListingSnapshot, toPublicListing, toSellerListing } from "./listing-payload";
import { deserializeListing, serializeListing } from "@/app/utils/listing-serialization";

const privateFields = ["reservePrice", "watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "reviewNote", "reviewRevision", "reviewStatus", "endingSoonReminderAt", "futureSecret"];
const privateListing = () => ({ ...makeListing({
  reservePrice: 98765, watchersIds: ["watcher-a", "watcher-b"], seenIds: ["private-viewer"],
  biddersIds: ["private-bidder"], commenterIds: ["private-commenter"], commentsIds: ["private-comment"],
  reviewNote: "Private review feedback", reviewRevision: 1234, endingSoonReminderAt: new Date(),
}), futureSecret: "A new database field must stay private" });

describe("listing disclosure boundary", () => {
  it("allowlists public fields rather than copying present or future private fields", () => {
    const listing = privateListing();
    const payload = toPublicListing(listing);
    for (const field of privateFields) expect(payload).not.toHaveProperty(field);
    expect(payload).toMatchObject({ id: listing.id, make: listing.make, currentBid: listing.currentBid, isNoReserve: false, watcherCount: 2, isWatching: false });
    expect(JSON.stringify(payload)).not.toContain("private-viewer");
    expect(listing.reservePrice).toBe(98765);
  });

  it.each([[null, false], ["watcher-a", true], ["other-user", false]] as const)("only reveals viewer %s's own watch state", (viewer, watching) => {
    const payload = toPublicListing(privateListing(), viewer);
    expect(payload.isWatching).toBe(watching);
    expect(payload.watcherCount).toBe(2);
    expect(JSON.stringify(payload)).not.toContain("watcher-a");
  });

  it.each([[null, true], [0, false], [25000, false]] as const)("preserves no-reserve semantics for %s without revealing its amount", (reservePrice, isNoReserve) => {
    expect(toPublicListing(makeListing({ reservePrice }))).toMatchObject({ isNoReserve });
  });

  it.each([{ id: "seller" }, { id: "moderator", role: "ADMIN" }])("gives management fields only to authorized viewer %j", (viewer) => {
    const payload = toSellerListing(privateListing(), viewer);
    expect(payload).toMatchObject({ reservePrice: 98765, reviewNote: "Private review feedback", reviewRevision: 1234 });
    for (const field of ["watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "futureSecret"]) expect(payload).not.toHaveProperty(field);
  });

  it.each([null, { id: "buyer", role: "USER" }])("denies management projection to %j", (viewer) => {
    expect(() => toSellerListing(privateListing(), viewer)).toThrow("Only the seller or an admin");
  });

  it("does not copy hidden keys inside public vehicle records", () => {
    const payload = toPublicListing(makeListing({ vehicleRecords: [{ label: "Service history", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf", privateNote: "Hidden receipt note" }] }));
    expect(payload.vehicleRecords).toEqual([{ label: "Service history", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" }]);
  });

  it("strips private extras again from snapshots and serialized events, including privileged input", () => {
    const privileged = { ...toSellerListing(privateListing(), { id: "seller" }), futureSecret: "secret" };
    for (const payload of [publicListingSnapshot(privileged), serializeListing(privileged), deserializeListing(serializeListing(privileged))]) {
      for (const field of privateFields) expect(payload).not.toHaveProperty(field);
    }
  });
});
