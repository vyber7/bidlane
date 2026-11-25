// The Listing codec: the one place that turns a stored Listing into a typed
// record, applying the defaults for fields that older documents never stored,
// and the one place that builds the public and seller projections.
//
// It reads both stored shapes, raw driver documents (ObjectIds, Longs) and ORM
// rows (strings, numbers), and has no runtime dependencies, so the database
// layer, server code and client code can all use it.

import type { Listing } from "@/app/types/database";
import type { ReviewStatus } from "@/prisma/native/listing-authoring";
import { readVehicleRecords } from "@/app/schemas/vehicle-trust";

/** A stored Listing as every reader sees it, with legacy defaults applied. */
export type DecodedListing = Omit<Listing, "reviewRevision" | "reviewStatus"> & {
  reviewRevision: number;
  reviewStatus: ReviewStatus | null;
};
export type ListingField = Exclude<keyof DecodedListing, "id">;

/** A stored value the codec cannot read. Names the field so data problems are traceable. */
export class StoredListingError extends Error {
  constructor(readonly field: string, readonly value: unknown) {
    super(`Stored Listing has an invalid ${field}`);
    this.name = "StoredListingError";
  }
}

type Read<T> = (value: unknown, field: string) => T;
const bson = (value: unknown, type: string) =>
  typeof value === "object" && value !== null && (value as { _bsontype?: unknown })._bsontype === type;

const integer: Read<number> = (value, field) => {
  const number = bson(value, "Long") ? (value as { toNumber(): number }).toNumber() : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) throw new StoredListingError(field, value);
  return number;
};
const text: Read<string> = (value, field) => {
  if (typeof value !== "string") throw new StoredListingError(field, value);
  return value;
};
const date: Read<Date> = (value, field) => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new StoredListingError(field, value);
  return value;
};
const boolean: Read<boolean> = (value, field) => {
  if (typeof value !== "boolean") throw new StoredListingError(field, value);
  return value;
};
// Driver documents hold ObjectIds; ORM rows already hold their hex strings.
const id: Read<string> = (value, field) => {
  if (bson(value, "ObjectId")) return (value as { toHexString(): string }).toHexString();
  if (typeof value !== "string" || !value) throw new StoredListingError(field, value);
  return value;
};
const reviewStatuses: readonly (string | null)[] = ["PENDING", "APPROVED", "CHANGES_REQUESTED"];
const reviewStatus: Read<ReviewStatus> = (value, field) => {
  if (typeof value !== "string" || !reviewStatuses.includes(value)) throw new StoredListingError(field, value);
  return value as ReviewStatus;
};
const json: Read<unknown> = (value) => value;

// Combinators: what a missing (null or absent) stored value reads as.
const required = <T>(read: Read<T>): Read<T> => read;
const or = <T>(read: Read<T>, fallback: T): Read<T> => (value, field) => (value == null ? fallback : read(value, field));
const nullable = <T>(read: Read<T>): Read<T | null> => or<T | null>(read, null);
const list = <T>(read: Read<T>): Read<T[]> => (value, field) => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new StoredListingError(field, value);
  return value.map((item) => read(item, field));
};

// Every Listing field and how it reads. The legacy defaults are the `or`
// entries: Listings stored without a status read as Upcoming, without a
// Review revision as revision 0, without a view count as one view.
const fields: { [Field in ListingField]: Read<DecodedListing[Field]> } = {
  userId: required(id),
  year: required(integer),
  make: required(text),
  model: required(text),
  miles: required(integer),
  images: list(text),
  location: required(text),
  description: required(text),
  transmission: nullable(text),
  drivetrain: nullable(text),
  titleStatus: nullable(text),
  serviceHistory: nullable(text),
  modifications: nullable(text),
  vin: nullable(text),
  vehicleRecords: or(json, null) as Read<DecodedListing["vehicleRecords"]>,
  knownFlaws: nullable(text),
  reservePrice: nullable(integer),
  createdAt: required(date),
  lastCommentAt: nullable(date),
  updatedAt: nullable(date),
  views: or(integer, 1),
  coverImage: nullable(text),
  auctionStartsAt: nullable(date),
  auctionEndsAt: nullable(date),
  endingSoonReminderAt: nullable(date),
  status: or(text, "UPCOMING"),
  result: nullable(text),
  paymentBuyerConfirmedAt: nullable(date),
  paymentSellerConfirmedAt: nullable(date),
  paperworkBuyerConfirmedAt: nullable(date),
  paperworkSellerConfirmedAt: nullable(date),
  pickupBuyerConfirmedAt: nullable(date),
  pickupSellerConfirmedAt: nullable(date),
  reviewStatus: nullable(reviewStatus),
  reviewRevision: or(integer, 0),
  reviewNote: nullable(text),
  isFeatured: or(boolean, false),
  startingBid: nullable(integer),
  currentBid: nullable(integer),
  bidIncrement: nullable(integer),
  biddersIds: list(id),
  highestBidderId: nullable(id),
  seenIds: list(id),
  watchersIds: list(id),
  commentsIds: list(id),
  commenterIds: list(id),
};
const allFields = Object.keys(fields) as ListingField[];

/**
 * Decode a stored Listing, a driver document or an ORM row. With `only`, decode
 * just those fields, for repositories that fetch a narrow projection; the
 * result then carries only `id` and those fields.
 */
export function decodeListing(stored: object): DecodedListing;
export function decodeListing<const Only extends readonly ListingField[]>(
  stored: object,
  only: Only,
): Pick<DecodedListing, "id" | Only[number]>;
export function decodeListing(stored: object, only: readonly ListingField[] = allFields) {
  const source = stored as Record<string, unknown>;
  const decoded: Record<string, unknown> = { id: id(source._id ?? source.id, "id") };
  for (const field of only) decoded[field] = fields[field](source[field], field);
  return decoded;
}

/** The driver projection for a narrow decode, so the fetched fields and the decoded fields are one list. */
export function listingProjection(only: readonly ListingField[]) {
  return Object.fromEntries(only.map((field) => [field, 1 as const]));
}

// Projections. Runtime allowlist: adding a database field must never publish it implicitly.

export const publicListingFields = [
  "id", "userId", "year", "make", "model", "miles", "images", "location", "description",
  "transmission", "drivetrain", "titleStatus", "serviceHistory", "modifications", "knownFlaws",
  "vin", "vehicleRecords", "createdAt", "updatedAt", "lastCommentAt", "views", "coverImage",
  "auctionStartsAt", "auctionEndsAt", "status", "result", "isFeatured", "startingBid", "currentBid",
  "bidIncrement", "highestBidderId",
] as const satisfies readonly (keyof Listing)[];

type PublicFields = Pick<Listing, (typeof publicListingFields)[number]>;
export type PublicListing = PublicFields & {
  isNoReserve: boolean;
  watcherCount: number;
  isWatching: boolean;
};
export type SellerListing = PublicListing & Pick<DecodedListing,
  "reservePrice" | "reviewStatus" | "reviewRevision" | "reviewNote"
>;

// What the projections read: the public fields plus what the derived fields come from.
type ListingSource = Omit<PublicFields, "vehicleRecords"> & {
  vehicleRecords: unknown;
  reservePrice: number | null;
  watchersIds: readonly string[];
};
type ManagedListingSource = ListingSource & Pick<DecodedListing, "reviewStatus" | "reviewRevision" | "reviewNote">;

function pickPublicFields(listing: Omit<PublicFields, "vehicleRecords"> & { vehicleRecords: unknown }): PublicFields {
  return Object.fromEntries(publicListingFields.map((field) => [field, listing[field]])) as PublicFields;
}

export function toPublicListing(listing: ListingSource, viewerId?: string | null): PublicListing {
  return {
    ...pickPublicFields(listing),
    vehicleRecords: readVehicleRecords(listing.vehicleRecords),
    isNoReserve: listing.reservePrice === null,
    watcherCount: listing.watchersIds.length,
    isWatching: Boolean(viewerId && listing.watchersIds.includes(viewerId)),
  };
}

// Reapply the allowlist at event boundaries, even if a caller passes an object
// with extra fields despite its static PublicListing type.
export function publicListingSnapshot(listing: PublicListing): PublicListing {
  return {
    ...pickPublicFields(listing),
    vehicleRecords: readVehicleRecords(listing.vehicleRecords),
    isNoReserve: listing.isNoReserve,
    watcherCount: listing.watcherCount,
    isWatching: listing.isWatching,
  };
}

export function toSellerListing(listing: ManagedListingSource, viewer: { id: string; role?: string | null } | null): SellerListing {
  if (!viewer || (viewer.id !== listing.userId && viewer.role !== "ADMIN")) {
    throw new Error("Only the seller or an admin can access listing management data.");
  }
  return {
    ...toPublicListing(listing, viewer.id),
    reservePrice: listing.reservePrice,
    reviewStatus: listing.reviewStatus,
    reviewRevision: listing.reviewRevision,
    reviewNote: listing.reviewNote,
  };
}
