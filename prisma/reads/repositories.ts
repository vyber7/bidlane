import { MongoAndExpr, MongoOrExpr, MongoFieldFilter as field, MongoExistsExpr } from "@prisma/orm-mongo/query-ast";
import { ObjectId } from "mongodb";
import type { DatabaseV8 } from "../v8/client";
import type { Bid, Listing } from "@/app/types/database";
import type { BidWithListing } from "@/app/account/lib/bids";
import type { SoldListing } from "@/app/account/lib/shipments";

const publicFilter = MongoOrExpr.of([
  field.in("status", ["LIVE", "ENDED"]),
  MongoAndExpr.of([field.eq("status", "UPCOMING"), field.eq("reviewStatus", "APPROVED")]),
]);
const vehicleFields = ["id", "year", "make", "model", "location", "status", "currentBid", "coverImage", "auctionEndsAt"] as const;
function vehicle(row: Listing) {
  return { id: row.id, year: row.year, make: row.make, model: row.model, location: row.location, status: row.status ?? "UPCOMING", currentBid: row.currentBid ?? null, coverImage: row.coverImage ?? null, auctionEndsAt: row.auctionEndsAt ?? null };
}
export function listingReadDefaults(row: Listing): Listing {
  return {
    ...row, status: row.status ?? "UPCOMING", views: row.views ?? 1, isFeatured: row.isFeatured ?? false,
    images: row.images ?? [], watchersIds: row.watchersIds ?? [], biddersIds: row.biddersIds ?? [],
    seenIds: row.seenIds ?? [], commentsIds: row.commentsIds ?? [], commenterIds: row.commenterIds ?? [],
  };
}
const bid = (row: Bid): Bid => ({ id: row.id, amount: row.amount, createdAt: row.createdAt, listingId: row.listingId, userId: row.userId });

// These are nontransactional reads. Native session-bound writes stay in
// prisma/native; ORM includes and queries cannot join a native transaction.
export function createReadRepositories({ db, database }: Pick<DatabaseV8, "db" | "database">) {
  const contacts = async (ids: string[]) => {
    if (!ids.length) return new Map<string, { name: string | null; email: string | null }>();
    const users = await db.orm.User.where(field.in("id", [...new Set(ids)])).select("id", "name", "email").all();
    return new Map(users.map((user) => [user.id, { name: user.name, email: user.email }]));
  };
  return {
    listings: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const row = await db.orm.Listing.where({ id }).first();
        return row ? listingReadDefaults(row) : null;
      },
      async public() { return (await db.orm.Listing.where(publicFilter).orderBy({ createdAt: -1 }).all()).map(listingReadDefaults); },
      async live() { return (await db.orm.Listing.where({ status: "LIVE" }).all()).map(listingReadDefaults); },
      async sold() {
        return (await db.orm.Listing.where({ status: "ENDED", result: "SOLD" })
          .where(MongoAndExpr.of([field.isNotNull("currentBid"), MongoExistsExpr.exists("currentBid")]))
          .orderBy({ auctionEndsAt: -1 }).limit(4).all()).map(listingReadDefaults);
      },
      async owned(userId: string) { return (await db.orm.Listing.where({ userId }).orderBy({ createdAt: -1 }).all()).map(listingReadDefaults); },
      // The current ORM has no count terminal. Keep indexed native counts on
      // the same pool, without loading all matching documents into memory.
      count(status?: string) { return database.collection("Listing").countDocuments(status ? { status } : {}); },
    },
    bids: {
      async forListing(listingId: string) {
        if (!ObjectId.isValid(listingId)) return [];
        const rows = await db.orm.Bid.where({ listingId }).orderBy({ amount: -1 }).all();
        const ids = [...new Set(rows.map((row) => row.userId))];
        const users = ids.length ? await db.orm.User.where(field.in("id", ids)).select("id", "name").all() : [];
        const names = new Map(users.map((user) => [user.id, { name: user.name }]));
        return rows.map((row) => {
          const user = names.get(row.userId);
          if (!user) throw new Error("Bid author not found");
          return { ...bid(row), user };
        });
      },
      async forUser(userId: string): Promise<BidWithListing[]> {
        const rows = await db.orm.Bid.where({ userId }).orderBy({ createdAt: -1 }).include("listing").all();
        return rows.map((row) => {
          if (!row.listing) throw new Error("Bid listing not found");
          return { ...bid(row), listing: listingReadDefaults(row.listing) };
        });
      },
    },
    sellers: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const row = await db.orm.User.where({ id }).select("id", "name", "image", "createdAt", "emailVerified").first();
        return row ? { id: row.id, name: row.name, image: row.image, createdAt: row.createdAt, emailVerified: Boolean(row.emailVerified) } : null;
      },
      async identity(id: string) {
        const row = await db.orm.User.where({ id }).select("name", "emailVerified").first();
        return row ? { name: row.name, emailVerified: Boolean(row.emailVerified) } : null;
      },
      salesCount(userId: string) { return database.collection("Listing").countDocuments({ userId: new ObjectId(userId), status: "ENDED", result: "SOLD" }); },
      async active(userId: string) {
        return (await db.orm.Listing.where({ userId }).where(publicFilter).where(field.in("status", ["LIVE", "UPCOMING"]))
          .select(...vehicleFields).orderBy({ createdAt: -1 }).limit(12).all()).map(vehicle);
      },
      async sales(userId: string, page: number) {
        return (await db.orm.Listing.where({ userId, status: "ENDED", result: "SOLD" }).select(...vehicleFields)
          .orderBy({ auctionEndsAt: -1, id: -1 }).offset((page - 1) * 12).limit(12).all()).map(vehicle);
      },
    },
    shipments: {
      async forUser(userId: string): Promise<SoldListing[]> {
        const rows = await db.orm.Listing.where({ status: "ENDED", result: "SOLD" })
          .where(MongoOrExpr.of([field.eq("userId", userId), field.eq("highestBidderId", userId)]))
          .select("id", "userId", "year", "make", "model", "location", "coverImage", "currentBid", "startingBid", "auctionEndsAt", "updatedAt", "createdAt", "highestBidderId")
          .orderBy({ auctionEndsAt: -1 }).all();
        const users = await contacts(rows.flatMap((row) => [row.userId, ...(row.highestBidderId ? [row.highestBidderId] : [])]));
        return rows.map((row) => {
          const user = users.get(row.userId);
          if (!user) throw new Error("Listing seller not found");
          return {
            id: row.id, userId: row.userId, year: row.year, make: row.make, model: row.model, location: row.location, coverImage: row.coverImage,
            currentBid: row.currentBid, startingBid: row.startingBid, auctionEndsAt: row.auctionEndsAt, updatedAt: row.updatedAt, createdAt: row.createdAt,
            user, highestBidder: row.highestBidderId ? users.get(row.highestBidderId) ?? null : null,
          };
        });
      },
    },
  };
}
