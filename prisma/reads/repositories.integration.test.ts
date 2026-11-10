import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId, type Document } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { PrismaClient } from "@prisma/client";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createReadRepositories } from "./repositories";
import { createNativeRepositories, type NativeRepositories } from "../native/repositories";
import { ensureNativeIndexes } from "../native/indexes.mjs";
import type { AuthUser } from "../native/auth";
import type { Listing } from "@/app/types/database";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, trigger: vi.fn(), save: vi.fn() }));
const sessions = new AsyncLocalStorage<{ user: { email: string } } | null>();
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local read database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/libs/prismadb", () => ({ default: new Proxy({}, { get() { throw new Error("Application reads must not use Prisma 6"); } }) }));
vi.mock("@/app/actions/getSession", () => ({ getSession: async () => sessions.getStore() ?? null }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: state.trigger } }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/libs/server-upload", () => ({ saveUploadedFile: state.save }));
import { makeListing } from "@/app/test/auction-fixtures";
import { canViewListing } from "@/app/libs/listing-review";
import { toPublicListing, toSellerListing } from "@/app/libs/listing-payload";
import { getSellerProfile } from "@/app/libs/seller-profile";
import getBids from "@/app/actions/getBids";
import getSoldAuctions from "@/app/actions/getSoldAuctions";
import { buildBidSummaries } from "@/app/account/lib/bids";
import { buildShipments } from "@/app/account/lib/shipments";
import { GET as overview } from "@/app/api/admin/overview/route";
import { PATCH as edit } from "@/app/api/listing/[id]/route";
import { POST as upload } from "@/app/api/uploads/route";
import { POST as start } from "@/app/api/auction-start/route";

const image = "https://res.cloudinary.com/demo/image/upload/read-fixture.jpg";
const request = (data: unknown) => new Request("http://localhost/api/listing", { method: "POST", body: JSON.stringify(data) });
const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("Prisma 8 read compatibility on a local replica set", () => {
  let connection: DatabaseV8, reads: ReturnType<typeof createReadRepositories>, native: NativeRepositories, legacy: PrismaClient;
  let seller: AuthUser, buyer: AuthUser, other: AuthUser, admin: AuthUser;
  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Read tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_reads";
    const localUrl = parsed.toString(); connection = createDatabaseV8(localUrl); state.connection = connection;
    await connection.mongoClient.connect(); await connection.database.dropDatabase(); await ensureNativeIndexes(connection.database);
    reads = createReadRepositories(connection); native = createNativeRepositories(connection.database); legacy = new PrismaClient({ datasourceUrl: localUrl });
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks(); state.trigger.mockResolvedValue(undefined); state.save.mockResolvedValue(image);
    for (const item of await connection.database.listCollections().toArray()) await connection.database.collection(item.name).deleteMany({});
    vi.stubEnv("NEXTAUTH_SECRET", "local-read-test-secret"); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    seller = await native.users.create({ email: "seller@example.com", name: "Seller Name", emailVerified: new Date() });
    buyer = await native.users.create({ email: "buyer@example.com", name: "Buyer Name", emailVerified: new Date() });
    other = await native.users.create({ email: "other@example.com", name: "Other Name", emailVerified: new Date() });
    admin = await native.users.create({ email: "admin@example.com", name: "Admin Name", emailVerified: new Date() });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "ADMIN" } });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  afterAll(async () => {
    if (connection) { await legacy?.$disconnect(); await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);
  const asUser = <T>(user: AuthUser | null, fn: () => T): T => sessions.run(user ? { user: { email: user.email! } } : null, fn);
  const listings = () => connection.database.collection("Listing");
  async function listing(overrides: Partial<Listing> = {}) {
    const data = makeListing({ id: new ObjectId().toHexString(), userId: seller.id, highestBidderId: null, images: [image], ...overrides });
    const { id, ...fields } = data;
    const document: Document = { ...fields, _id: new ObjectId(id), userId: new ObjectId(data.userId), highestBidderId: data.highestBidderId ? new ObjectId(data.highestBidderId) : null, futureSecret: "private listing metadata" };
    for (const key of ["year", "miles", "views", "reservePrice", "currentBid", "startingBid", "bidIncrement", "reviewRevision"] as const) if (data[key] != null) document[key] = Long.fromNumber(data[key]);
    for (const key of ["seenIds", "watchersIds", "biddersIds", "commentsIds", "commenterIds"] as const) document[key] = data[key].map((value) => new ObjectId(value));
    await listings().insertOne(document); return id;
  }
  const update = (id: string, fields: Record<string, unknown>) => listings().updateOne({ _id: new ObjectId(id) }, { $set: fields });
  async function bid(listingId: string, amount: number, user = buyer, createdAt = new Date()) {
    await connection.database.collection("Bid").insertOne({ _id: new ObjectId(), listingId: new ObjectId(listingId), userId: new ObjectId(user.id), amount: Long.fromNumber(amount), createdAt });
  }
  const correction = (id: string, revision = 3) => asUser(seller, () => edit(request({ revision, data: { year: 2021, make: "Porsche", model: "911", miles: 250, location: "Miami", description: "Corrected", reservePrice: 12000, vin: "", vehicleRecords: [], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "Known", modifications: "None", knownFlaws: "Paint chips", images: [image], userId: buyer.id, status: "LIVE", reviewStatus: "APPROVED" } }), { params: Promise.resolve({ id }) }));

  it("decodes ObjectIds, BSON longs, JSON, dates and fields identically to Prisma 6", async () => {
    const id = await listing({ watchersIds: [buyer.id], reservePrice: 20000 });
    expect(await reads.listings.find(id)).toEqual(await legacy.listing.findUnique({ where: { id } }));
    expect(await reads.listings.find(id)).not.toHaveProperty("futureSecret");
    const payload = toPublicListing((await reads.listings.find(id))!, buyer.id);
    expect(payload).toMatchObject({ isWatching: true, watcherCount: 1, isNoReserve: false });
    for (const key of ["reservePrice", "watchersIds", "biddersIds", "seenIds", "reviewNote", "futureSecret"]) expect(payload).not.toHaveProperty(key);
  });

  it.each(["missing", "null"])("preserves Prisma 6 defaults for %s legacy fields without writing data", async (kind) => {
    const id = await listing(); const fields = ["status", "views", "isFeatured", "images", "watchersIds", "biddersIds", "seenIds", "commentsIds", "commenterIds", "lastCommentAt", "updatedAt", "reviewStatus", "reviewRevision", "vin", "vehicleRecords"];
    await listings().updateOne({ _id: new ObjectId(id) }, kind === "missing" ? { $unset: Object.fromEntries(fields.map((key) => [key, ""])) } : { $set: Object.fromEntries(fields.map((key) => [key, null])) });
    const before = await listings().findOne({ _id: new ObjectId(id) });
    expect(await reads.listings.find(id)).toEqual(await legacy.listing.findUnique({ where: { id } }));
    expect(await listings().findOne({ _id: new ObjectId(id) })).toEqual(before);
  });

  it("matches raw visibility filters and preserves listing access for owners and admins", async () => {
    const ids = await Promise.all([listing({ status: "LIVE" }), listing({ status: "ENDED" }), listing({ status: "UPCOMING", reviewStatus: "APPROVED" }), listing({ status: "UPCOMING", reviewStatus: "PENDING" }), listing({ status: "UPCOMING", reviewStatus: null }), listing({ status: "UPCOMING", reviewStatus: "CHANGES_REQUESTED" })]);
    const missingStatus = await listing({ reviewStatus: "APPROVED" }); await listings().updateOne({ _id: new ObjectId(missingStatus) }, { $unset: { status: "" } });
    const actual = await reads.listings.public(), previous = await legacy.listing.findMany({ where: { OR: [{ status: { in: ["LIVE", "ENDED"] } }, { status: "UPCOMING", reviewStatus: "APPROVED" }] }, orderBy: { createdAt: "desc" } });
    expect(actual).toEqual(previous); expect(actual).toHaveLength(3);
    const privateListing = (await reads.listings.find(ids[3]))!;
    expect(canViewListing(privateListing, null)).toBe(false); expect(canViewListing(privateListing, buyer)).toBe(false); expect(canViewListing(privateListing, seller)).toBe(true); expect(canViewListing(privateListing, { id: admin.id, role: "ADMIN" })).toBe(true);
    expect(await reads.listings.live()).toEqual(await legacy.listing.findMany({ where: { status: "LIVE" } }));
  });

  it("keeps the four newest sold auctions, includes a zero bid, and excludes null/missing bids", async () => {
    await Promise.all(Array.from({ length: 6 }, (_, i) => listing({ status: "ENDED", result: "SOLD", currentBid: i * 1000, auctionEndsAt: new Date(2026, 0, i === 0 ? 9 : i + 1) })));
    await listing({ status: "ENDED", result: "RESERVE_NOT_MET", currentBid: 50000 });
    const missing = await listing({ status: "ENDED", result: "SOLD", currentBid: null });
    await listing({ status: "ENDED", result: "SOLD", currentBid: null }); await listings().updateOne({ _id: new ObjectId(missing) }, { $unset: { currentBid: "" } });
    const previous = await legacy.listing.findMany({ where: { status: "ENDED", result: "SOLD", currentBid: { not: null } }, orderBy: { auctionEndsAt: "desc" }, take: 4 });
    expect(await reads.listings.sold()).toEqual(previous); expect(await getSoldAuctions()).toEqual(previous.map((row) => toPublicListing(row)));
    expect(previous.some((row) => row.currentBid === 0)).toBe(true);
  });

  it("loads only the owner's uploaded listings, including private submissions", async () => {
    await listing({ userId: seller.id, status: "UPCOMING", reviewStatus: "PENDING" }); await listing({ userId: buyer.id });
    const actual = await reads.listings.owned(seller.id);
    expect(actual).toEqual(await legacy.listing.findMany({ where: { userId: seller.id }, orderBy: { createdAt: "desc" } }));
    expect(actual).toHaveLength(1); expect(toSellerListing(actual[0], seller)).not.toHaveProperty("seenIds");
    expect(() => toSellerListing(actual[0], buyer)).toThrow("Only the seller");
  });

  it("preserves seller pagination, stable ObjectId ties, counts, and public account fields", async () => {
    await Promise.all(Array.from({ length: 25 }, () => listing({ status: "ENDED", result: "SOLD", currentBid: 5000 })));
    await listing({ status: "UPCOMING", reviewStatus: "PENDING", createdAt: new Date("2026-01-30") });
    await Promise.all(Array.from({ length: 13 }, (_, index) => listing({ status: "LIVE", createdAt: new Date(2026, 0, index + 1) })));
    await listing({ status: "UPCOMING", reviewStatus: "APPROVED", createdAt: new Date("2026-01-25") }); await listing({ userId: buyer.id, status: "ENDED", result: "SOLD" });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(seller.id) }, { $set: { hashedPassword: "private hash", futureSecret: "private account metadata" } });
    const profile = (await getSellerProfile(seller.id, 2))!;
    expect(profile.salesCount).toBe(25); expect(profile.sales).toHaveLength(12); expect(profile.active).toHaveLength(12);
    expect(Object.keys(profile.seller).sort()).toEqual(["id", "name", "image", "createdAt", "emailVerified"].sort()); expect(profile.seller.emailVerified).toBe(true);
    const select = { id: true, year: true, make: true, model: true, location: true, status: true, currentBid: true, coverImage: true, auctionEndsAt: true } as const;
    expect(profile.sales).toEqual(await legacy.listing.findMany({ where: { userId: seller.id, status: "ENDED", result: "SOLD" }, select, orderBy: [{ auctionEndsAt: "desc" }, { id: "desc" }], skip: 12, take: 12 }));
    expect(profile.active).toEqual(await legacy.listing.findMany({ where: { userId: seller.id, status: { in: ["LIVE", "UPCOMING"] }, OR: [{ status: "LIVE" }, { status: "UPCOMING", reviewStatus: "APPROVED" }] }, select, orderBy: { createdAt: "desc" }, take: 12 }));
    expect(JSON.stringify(profile)).not.toContain("private");
  });

  it("handles missing and legacy unverified sellers without exposing proof timestamps", async () => {
    expect(await getSellerProfile(new ObjectId().toHexString())).toBeNull();
    await connection.database.collection("User").updateOne({ _id: new ObjectId(seller.id) }, { $unset: { emailVerified: "" } });
    expect((await getSellerProfile(seller.id))?.seller.emailVerified).toBe(false); expect(await reads.sellers.identity(seller.id)).toEqual({ name: seller.name, emailVerified: false });
  });

  it("loads bids in amount order and publishes only author names", async () => {
    const id = await listing(); await bid(id, 1000); await bid(id, 2000, other);
    const previous = await legacy.bid.findMany({ where: { listingId: id }, orderBy: { amount: "desc" }, include: { user: { select: { name: true } } } });
    expect(await getBids(id)).toEqual(previous);
    for (const item of await getBids(id)) expect(Object.keys(item.user)).toEqual(["name"]);
    await connection.database.collection("User").deleteOne({ _id: new ObjectId(other.id) }); expect(await getBids(id)).toEqual([]);
  });

  it("preserves account bid aggregation and limits history to the authenticated account", async () => {
    const first = await listing({ highestBidderId: buyer.id }), second = await listing();
    await bid(first, 2000, buyer, new Date("2026-01-01")); await bid(first, 3000, buyer, new Date("2026-01-02")); await bid(second, 1000, buyer, new Date("2026-01-03")); await bid(second, 9000, other);
    const actual = await reads.bids.forUser(buyer.id), previous = await legacy.bid.findMany({ where: { userId: buyer.id }, include: { listing: true }, orderBy: { createdAt: "desc" } });
    expect(actual).toEqual(previous); expect(buildBidSummaries(actual, buyer.id)).toEqual(buildBidSummaries(previous.map((row) => ({ ...row, listing: { ...row.listing, vehicleRecords: null } })), buyer.id));
    expect(buildBidSummaries(actual, buyer.id)).toHaveLength(2);
    await connection.database.collection("Bid").insertOne({ _id: new ObjectId(), listingId: new ObjectId(), userId: new ObjectId(buyer.id), amount: Long.ONE, createdAt: new Date() });
    await expect(reads.bids.forUser(buyer.id)).rejects.toThrow("Bid listing not found");
  });

  it.each(["seller", "buyer"])("reveals sale contact details only for the %s's completed transactions", async (role) => {
    const id = await listing({ status: "ENDED", result: "SOLD", currentBid: 15000, highestBidderId: buyer.id });
    await listing({ userId: other.id, status: "ENDED", result: "SOLD", highestBidderId: other.id }); await listing({ status: "LIVE", result: "SOLD", highestBidderId: buyer.id }); await listing({ status: "ENDED", result: "RESERVE_NOT_MET", highestBidderId: buyer.id });
    const actor = role === "seller" ? seller : buyer;
    const actual = await reads.shipments.forUser(actor.id), previous = await legacy.listing.findMany({ where: { status: "ENDED", result: "SOLD", OR: [{ userId: actor.id }, { highestBidderId: actor.id }] }, include: { user: { select: { name: true, email: true } }, highestBidder: { select: { name: true, email: true } } }, orderBy: { auctionEndsAt: "desc" } });
    expect(buildShipments(actual, actor.id)).toEqual(buildShipments(previous, actor.id)); expect(actual.map((row) => row.id)).toEqual([id]);
    expect(Object.keys(actual[0].user).sort()).toEqual(["email", "name"]); expect(Object.keys(actual[0].highestBidder!).sort()).toEqual(["email", "name"]);
  });

  it("keeps admin counts private and observes role revocation on the next request", async () => {
    await listing({ status: "LIVE" }); await listing({ status: "UPCOMING", reviewStatus: "PENDING" });
    const response = await asUser(admin, () => overview()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ users: 4, listings: 2, liveAuctions: 1 });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "USER" } });
    expect((await asUser(admin, () => overview())).status).toBe(403); expect((await asUser(null, () => overview())).status).toBe(401);
  });

  it("enforces upload listing ownership and freezes media once bidding opens", async () => {
    const id = await listing({ status: "UPCOMING" });
    const send = (actor: AuthUser) => { const form = new FormData(); form.set("kind", "RECORD"); form.set("listingId", id); form.set("file", new File(["fixture"], "record.pdf")); return asUser(actor, () => upload(new Request("http://localhost/api/uploads", { method: "POST", body: form }))); };
    expect((await send(buyer)).status).toBe(404); expect(state.save).not.toHaveBeenCalled();
    expect((await send(seller)).status).toBe(201); expect(state.save).toHaveBeenCalledTimes(1);
    await update(id, { status: "LIVE" }); expect((await send(seller)).status).toBe(409); expect(state.save).toHaveBeenCalledTimes(1);
  });

  it("atomically corrects complete listing content with BSON defaults and a new review revision", async () => {
    const id = await listing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewRevision: 3, watchersIds: [buyer.id] });
    expect((await correction(id)).status).toBe(200);
    const raw = (await listings().findOne({ _id: new ObjectId(id) }, { promoteLongs: false }))!;
    expect(raw).toMatchObject({ year: Long.fromNumber(2021), miles: Long.fromNumber(250), reservePrice: Long.fromNumber(12000), status: "UPCOMING", userId: new ObjectId(seller.id), reviewStatus: "PENDING", reviewRevision: Long.fromNumber(4), reviewNote: null, vin: null, images: [image], watchersIds: [new ObjectId(buyer.id)] });
    expect(raw.updatedAt).toBeInstanceOf(Date); expect((await legacy.listing.findUnique({ where: { id } }))?.description).toBe("Corrected");
    expect((await correction(id)).status).toBe(409);
  });

  it("permits one of two concurrent corrections from the same revision", async () => {
    const id = await listing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewRevision: 3 });
    const results = await Promise.all([correction(id), correction(id)]); expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    expect((await native.listingAuthoring.find(id))?.reviewRevision).toBe(4);
  });

  it("leaves content and review state intact when persisting a correction fails", async () => {
    const id = await listing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewRevision: 3 });
    const before = await listings().findOne({ _id: new ObjectId(id) });
    await connection.database.command({ collMod: "Listing", validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { expect((await correction(id)).status).toBe(500); }
    finally { await connection.database.command({ collMod: "Listing", validator: {} }); }
    expect(await listings().findOne({ _id: new ObjectId(id) })).toEqual(before);
  });

  it("does not overwrite a concurrent auction start with seller corrections", async () => {
    const id = await listing({ status: "UPCOMING", reviewStatus: "APPROVED", reviewRevision: 3 });
    const results = await Promise.all([correction(id), asUser(seller, () => start(request({ listingId: id, startingBid: 1000, bidIncrement: 100, endTime: new Date(Date.now() + 3600_000).toISOString() })))]);
    expect(results.filter((item) => [200, 201].includes(item.status))).toHaveLength(1); expect(results.filter((item) => item.status === 409)).toHaveLength(1);
  });
});
