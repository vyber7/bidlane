import { describe, expect, it } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { deserializeListing, serializeListing } from "./listing-serialization";

describe("listing event dates", () => {
  it("transports populated dates as ISO strings and restores them for client state", () => {
    const listing = makeListing({ lastCommentAt: new Date("2026-10-14T13:00:00.000Z") });
    const payload = serializeListing(listing);
    expect(payload.createdAt).toBe(listing.createdAt.toISOString());
    expect(payload.updatedAt).toBe(listing.updatedAt?.toISOString());
    expect(payload.lastCommentAt).toBe(listing.lastCommentAt?.toISOString());
    expect(payload.auctionStartsAt).toBe(listing.auctionStartsAt?.toISOString());
    expect(payload.auctionEndsAt).toBe(listing.auctionEndsAt?.toISOString());
    expect(deserializeListing(payload)).toEqual(listing);
  });

  it("keeps optional dates null across a JSON round trip", () => {
    const listing = makeListing({ updatedAt: null, lastCommentAt: null, auctionStartsAt: null, auctionEndsAt: null });
    const payload = serializeListing(listing);
    expect(payload).toMatchObject({ updatedAt: null, lastCommentAt: null, auctionStartsAt: null, auctionEndsAt: null });
    expect(deserializeListing(payload)).toEqual(listing);
  });
});
