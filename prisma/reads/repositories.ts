import {
  MongoAndExpr,
  MongoOrExpr,
  MongoFieldFilter as field,
  MongoExistsExpr,
} from "@prisma/orm-mongo/query-ast";
import { ObjectId } from "mongodb";
import type { DatabaseV8 } from "../v8/client";
import type { Bid, Listing } from "@/app/types/database";
import type { BidWithListing } from "@/app/account/lib/bids";
import type { SoldListing } from "@/app/account/lib/shipments";
import { completionFields, soldAuction } from "@/app/libs/transaction-completion";
import { publicListingFilter } from "@/app/libs/listing-review";

const vehicleFields = [
  "id",
  "year",
  "make",
  "model",
  "location",
  "status",
  "result",
  "startingBid",
  "currentBid",
  "coverImage",
  "auctionEndsAt",
] as const;
function vehicle(row: Listing) {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    location: row.location,
    status: row.status ?? "UPCOMING",
    result: row.result ?? null,
    startingBid: row.startingBid ?? null,
    currentBid: row.currentBid ?? null,
    coverImage: row.coverImage ?? null,
    auctionEndsAt: row.auctionEndsAt ?? null,
  };
}
export function listingReadDefaults(row: Listing): Listing {
  return {
    ...row,
    status: row.status ?? "UPCOMING",
    views: row.views ?? 1,
    isFeatured: row.isFeatured ?? false,
    images: row.images ?? [],
    watchersIds: row.watchersIds ?? [],
    biddersIds: row.biddersIds ?? [],
    seenIds: row.seenIds ?? [],
    commentsIds: row.commentsIds ?? [],
    commenterIds: row.commenterIds ?? [],
  };
}
const bid = (row: Bid): Bid => ({
  id: row.id,
  amount: row.amount,
  createdAt: row.createdAt,
  listingId: row.listingId,
  userId: row.userId,
});

export interface RecentBid {
  id: string;
  amount: number;
  bidderName: string | null;
  listingId: string;
  auctionTitle: string;
}

// These are nontransactional reads. Native session-bound writes stay in
// prisma/native; ORM includes and queries cannot join a native transaction.
export function createReadRepositories({
  db,
  database,
}: Pick<DatabaseV8, "db" | "database">) {
  const bidAuthors = async (rows: { userId: string }[]) => {
    const ids = [...new Set(rows.map((row) => row.userId))];
    const users = ids.length
      ? await db.orm.User.where(field.in("id", ids)).select("id", "name").all()
      : [];
    return new Map(users.map((user) => [user.id, { name: user.name }]));
  };
  const contacts = async (ids: string[]) => {
    if (!ids.length)
      return new Map<string, { name: string | null; email: string | null }>();
    const users = await db.orm.User.where(field.in("id", [...new Set(ids)]))
      .select("id", "name", "email")
      .all();
    return new Map(
      users.map((user) => [user.id, { name: user.name, email: user.email }]),
    );
  };
  return {
    listings: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const row = await db.orm.Listing.where({ id }).first();
        return row ? listingReadDefaults(row) : null;
      },
      async public() {
        return (
          await db.orm.Listing.where(publicListingFilter.read())
            .orderBy({ createdAt: -1 })
            .all()
        ).map(listingReadDefaults);
      },
      async live() {
        return (await db.orm.Listing.where({ status: "LIVE" }).all()).map(
          listingReadDefaults,
        );
      },
      async sold() {
        return (
          await db.orm.Listing.where({ status: "ENDED", result: "SOLD" })
            .where(
              MongoAndExpr.of([
                field.isNotNull("currentBid"),
                MongoExistsExpr.exists("currentBid"),
              ]),
            )
            .orderBy({ auctionEndsAt: -1 })
            .limit(4)
            .all()
        ).map(listingReadDefaults);
      },
      async owned(userId: string) {
        return (
          await db.orm.Listing.where({ userId })
            .orderBy({ createdAt: -1 })
            .all()
        ).map(listingReadDefaults);
      },
      // The current ORM has no count terminal. Keep indexed native counts on
      // the same pool, without loading all matching documents into memory.
      count(status?: string) {
        return database
          .collection("Listing")
          .countDocuments(status ? { status } : {});
      },
    },
    bids: {
      async latestForListings(
        listings: Pick<Listing, "id" | "year" | "make" | "model">[],
      ): Promise<RecentBid[]> {
        if (!listings.length) return [];
        const titles = new Map(listings.map((listing) => [
          listing.id, `${listing.year} ${listing.make} ${listing.model}`,
        ]));
        const rows = await db.orm.Bid.where(field.in("listingId", [...titles.keys()]))
          .orderBy({ createdAt: -1, id: -1 })
          .limit(10)
          .select("id", "amount", "listingId", "userId")
          .all();
        const authors = await bidAuthors(rows);
        return rows.map((row) => ({
          id: row.id,
          amount: row.amount,
          bidderName: authors.get(row.userId)?.name ?? null,
          listingId: row.listingId,
          auctionTitle: titles.get(row.listingId)!,
        }));
      },
      async forListing(listingId: string) {
        if (!ObjectId.isValid(listingId)) return [];
        const rows = await db.orm.Bid.where({ listingId })
          .orderBy({ amount: -1 })
          .all();
        const names = await bidAuthors(rows);
        return rows.map((row) => {
          const user = names.get(row.userId);
          if (!user) throw new Error("Bid author not found");
          return { ...bid(row), user };
        });
      },
      async forUser(userId: string): Promise<BidWithListing[]> {
        const rows = await db.orm.Bid.where({ userId })
          .orderBy({ createdAt: -1 })
          .include("listing")
          .all();
        return rows.map((row) => {
          if (!row.listing) throw new Error("Bid listing not found");
          return { ...bid(row), listing: listingReadDefaults(row.listing) };
        });
      },
    },
    sellers: {
      async find(id: string) {
        if (!ObjectId.isValid(id)) return null;
        const row = await db.orm.User.where({ id })
          .select("id", "name", "image", "createdAt", "emailVerified")
          .first();
        return row
          ? {
              id: row.id,
              name: row.name,
              image: row.image,
              createdAt: row.createdAt,
              emailVerified: Boolean(row.emailVerified),
            }
          : null;
      },
      async identity(id: string) {
        const row = await db.orm.User.where({ id })
          .select("name", "emailVerified")
          .first();
        return row
          ? { name: row.name, emailVerified: Boolean(row.emailVerified) }
          : null;
      },
      salesCount(userId: string) {
        return database
          .collection("Listing")
          .countDocuments({
            userId: new ObjectId(userId),
            status: "ENDED",
            result: "SOLD",
          });
      },
      async active(userId: string) {
        return (
          await db.orm.Listing.where({ userId })
            .where(publicListingFilter.read())
            .where(field.in("status", ["LIVE", "UPCOMING", null]))
            .select(...vehicleFields)
            .orderBy({ createdAt: -1 })
            .limit(12)
            .all()
        ).map(vehicle);
      },
      async sales(userId: string, page: number) {
        return (
          await db.orm.Listing.where({
            userId,
            status: "ENDED",
            result: "SOLD",
          })
            .select(...vehicleFields)
            .orderBy({ auctionEndsAt: -1, id: -1 })
            .offset((page - 1) * 12)
            .limit(12)
            .all()
        ).map(vehicle);
      },
    },
    shipments: {
      async forUser(userId: string): Promise<SoldListing[]> {
        const rows = await db.orm.Listing.where(soldAuction)
          .where(
            MongoOrExpr.of([
              field.eq("userId", userId),
              field.eq("highestBidderId", userId),
            ]),
          )
          .select(
            "id",
            "status",
            "result",
            "userId",
            "year",
            "make",
            "model",
            "location",
            "coverImage",
            "currentBid",
            "startingBid",
            "auctionEndsAt",
            "updatedAt",
            "createdAt",
            "highestBidderId",
            ...Object.values(completionFields).flatMap((roles) => Object.values(roles)),
          )
          .orderBy({ auctionEndsAt: -1 })
          .all();
        const users = await contacts(
          rows.flatMap((row) => [
            row.userId,
            ...(row.highestBidderId ? [row.highestBidderId] : []),
          ]),
        );
        return rows.map((row) => {
          const user = users.get(row.userId);
          if (!user) throw new Error("Listing seller not found");
          return {
            id: row.id,
            status: row.status,
            result: row.result,
            userId: row.userId,
            highestBidderId: row.highestBidderId,
            paymentBuyerConfirmedAt: row.paymentBuyerConfirmedAt,
            paymentSellerConfirmedAt: row.paymentSellerConfirmedAt,
            paperworkBuyerConfirmedAt: row.paperworkBuyerConfirmedAt,
            paperworkSellerConfirmedAt: row.paperworkSellerConfirmedAt,
            pickupBuyerConfirmedAt: row.pickupBuyerConfirmedAt,
            pickupSellerConfirmedAt: row.pickupSellerConfirmedAt,
            year: row.year,
            make: row.make,
            model: row.model,
            location: row.location,
            coverImage: row.coverImage,
            currentBid: row.currentBid,
            startingBid: row.startingBid,
            auctionEndsAt: row.auctionEndsAt,
            updatedAt: row.updatedAt,
            createdAt: row.createdAt,
            user,
            highestBidder: row.highestBidderId
              ? (users.get(row.highestBidderId) ?? null)
              : null,
          };
        });
      },
    },
  };
}
