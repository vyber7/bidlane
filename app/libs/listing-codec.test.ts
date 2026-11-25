import { describe, expect, it } from "vitest";
import { Long, ObjectId } from "mongodb";
import { decodeListing, publicListingSnapshot, toPublicListing, toSellerListing } from "./listing-codec";
import { makeListing } from "@/app/test/auction-fixtures";
import { deserializeListing, serializeListing } from "@/app/utils/listing-serialization";
import { completionFields } from "./transaction-completion";

const sellerId = new ObjectId();
const createdAt = new Date("2026-01-02T03:04:05Z");

// The oldest stored shape: only what the first Listing form wrote.
const historical = () => ({
  _id: new ObjectId(),
  userId: sellerId,
  year: 1999,
  make: "Mazda",
  model: "Miata",
  miles: 120000,
  location: "Portland, OR",
  description: "Original paint.",
  createdAt,
});

describe("the Listing codec", () => {
  it("reads a Listing stored without later fields with the legacy defaults", () => {
    const stored = historical();
    expect(decodeListing(stored)).toEqual({
      id: stored._id.toHexString(),
      userId: sellerId.toHexString(),
      year: 1999,
      make: "Mazda",
      model: "Miata",
      miles: 120000,
      location: "Portland, OR",
      description: "Original paint.",
      createdAt,
      images: [],
      transmission: null,
      drivetrain: null,
      titleStatus: null,
      serviceHistory: null,
      modifications: null,
      knownFlaws: null,
      vin: null,
      vehicleRecords: null,
      reservePrice: null,
      lastCommentAt: null,
      updatedAt: null,
      views: 1,
      coverImage: null,
      auctionStartsAt: null,
      auctionEndsAt: null,
      endingSoonReminderAt: null,
      status: "UPCOMING",
      result: null,
      paymentBuyerConfirmedAt: null,
      paymentSellerConfirmedAt: null,
      paperworkBuyerConfirmedAt: null,
      paperworkSellerConfirmedAt: null,
      pickupBuyerConfirmedAt: null,
      pickupSellerConfirmedAt: null,
      reviewStatus: null,
      reviewRevision: 0,
      reviewNote: null,
      isFeatured: false,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      biddersIds: [],
      highestBidderId: null,
      seenIds: [],
      watchersIds: [],
      commentsIds: [],
      commenterIds: [],
    });
  });

  it("reads a driver document with Long numbers and an ORM row as the same Listing", () => {
    const bidderId = new ObjectId();
    const document = {
      ...historical(),
      year: Long.fromNumber(1999),
      miles: Long.fromNumber(120000),
      views: Long.fromNumber(42),
      reviewRevision: Long.fromNumber(3),
      currentBid: Long.fromNumber(15000),
      highestBidderId: bidderId,
      biddersIds: [bidderId],
      status: "LIVE",
    };
    const row = {
      ...document,
      _id: undefined,
      id: document._id.toHexString(),
      userId: sellerId.toHexString(),
      year: 1999,
      miles: 120000,
      views: 42,
      reviewRevision: 3,
      currentBid: 15000,
      highestBidderId: bidderId.toHexString(),
      biddersIds: [bidderId.toHexString()],
    };
    const decoded = decodeListing(document);
    expect(decodeListing(row)).toEqual(decoded);
    expect(decoded).toMatchObject({
      year: 1999,
      views: 42,
      reviewRevision: 3,
      currentBid: 15000,
      highestBidderId: bidderId.toHexString(),
      biddersIds: [bidderId.toHexString()],
      status: "LIVE",
    });
  });

  it.each([
    ["year", 1999.5],
    ["currentBid", Long.fromString("9007199254740993")],
    ["make", 7],
    ["auctionEndsAt", new Date(Number.NaN)],
    ["auctionEndsAt", "2026-01-01"],
    ["reviewStatus", "REJECTED"],
    ["isFeatured", "yes"],
    ["watchersIds", "not-a-list"],
    ["highestBidderId", ""],
    ["miles", undefined],
  ] as const)("refuses a stored %s of %o, naming the field", (field, value) => {
    expect(() => decodeListing({ ...historical(), [field]: value })).toThrow(
      `Stored Listing has an invalid ${field}`,
    );
  });

  it("decodes only the requested fields of a narrow projection, with their defaults", () => {
    const stored = historical();
    expect(decodeListing({ _id: stored._id, status: null, views: null }, ["status", "views", "reviewRevision"])).toEqual({
      id: stored._id.toHexString(),
      status: "UPCOMING",
      views: 1,
      reviewRevision: 0,
    });
  });
});

const privateFields = ["reservePrice", "watchersIds", "seenIds", "biddersIds", "commenterIds", "commentsIds", "reviewNote", "reviewRevision", "reviewStatus", "endingSoonReminderAt", "futureSecret", ...Object.values(completionFields).flatMap(Object.values)];
const privateListing = () => ({ ...makeListing({
  reservePrice: 98765, watchersIds: ["watcher-a", "watcher-b"], seenIds: ["private-viewer"],
  biddersIds: ["private-bidder"], commenterIds: ["private-commenter"], commentsIds: ["private-comment"],
  reviewNote: "Private review feedback", endingSoonReminderAt: new Date(),
}), reviewRevision: 1234, futureSecret: "A new database field must stay private" });

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

  it.each([{ id: "seller" }, { id: "admin", role: "ADMIN" }])("gives management fields only to authorized viewer %j", (viewer) => {
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
