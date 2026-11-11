import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Long, ObjectId } from "mongodb";
import ConnectionString from "mongodb-connection-string-url";
import { createDatabaseV8, type DatabaseV8 } from "../v8/client";
import { createNativeRepositories, type NativeRepositories } from "./repositories";
import { ensureNativeIndexes } from "./indexes.mjs";
import type { AuthUser } from "./auth";

const state = vi.hoisted(() => ({ connection: undefined as DatabaseV8 | undefined, trigger: vi.fn() }));
const sessions = new AsyncLocalStorage<{ user: { email: string } } | null>();
vi.mock("@/app/libs/prismadb-v8", () => ({ getDatabaseV8: () => {
  if (!state.connection) throw new Error("Local authoring database is not initialized");
  return state.connection;
} }));
vi.mock("@/app/actions/getSession", () => ({ getSession: async () => sessions.getStore() ?? null }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { trigger: state.trigger } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { createListingDraft, updateListingDraft, deleteListingDraft, publishListingDraft, serializeDraft } from "@/app/libs/listing-drafts";
import { getListingReview, getReviewQueue } from "@/app/libs/listing-moderation";
import { emptyDraftPayload, type DraftPayload } from "@/app/schemas/listing-draft";
import { parseListing } from "@/app/libs/listing-validation";
import { POST as submit } from "@/app/api/new-listing/route";
import { POST as review } from "@/app/api/admin/listings/[id]/review/route";
import { PATCH as records } from "@/app/api/listing/[id]/vehicle-details/route";
import { POST as cover } from "@/app/api/listing/[id]/cover-image/route";
import { POST as photo, GET as gallery } from "@/app/api/cloudinary-images/route";
import { POST as start } from "@/app/api/auction-start/route";

const image = "https://res.cloudinary.com/demo/image/upload/car.jpg";
const complete: DraftPayload = {
  ...emptyDraftPayload,
  details: { ...emptyDraftPayload.details, year: "2020", make: "Porsche", model: "911", miles: "1000", location: "Miami", description: "One owner", transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "None known", modifications: "None known", knownFlaws: "None known" },
  images: [image],
};
const validated = () => parseListing({ ...complete.details, images: complete.images, vehicleRecords: complete.vehicleRecords });
const request = (body: unknown) => new Request("http://localhost/api/listing", { method: "POST", body: JSON.stringify(body) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const asUser = <T>(user: AuthUser | null, operation: () => T): T => sessions.run(user ? { user: { email: user.email! } } : null, operation);

const url = process.env.NATIVE_TEST_DATABASE_URL;
describe.skipIf(!url)("native listing authoring on a local MongoDB replica set", () => {
  let connection: DatabaseV8, repositories: NativeRepositories;
  let seller: AuthUser, other: AuthUser, admin: AuthUser;
  beforeAll(async () => {
    const parsed = new ConnectionString(url!);
    if (parsed.hosts.length !== 1 || !/^127\.0\.0\.1:\d+$/.test(parsed.hosts[0]) || !/^\/bidlane_test_native_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error("Authoring tests require a loopback bidlane_test_native_ database");
    parsed.pathname += "_authoring";
    const localUrl = parsed.toString();
    connection = createDatabaseV8(localUrl);
    state.connection = connection;
    await connection.mongoClient.connect();
    await connection.database.dropDatabase();
    await ensureNativeIndexes(connection.database);
    repositories = createNativeRepositories(connection.database);
  }, 30_000);
  beforeEach(async () => {
    vi.clearAllMocks(); state.trigger.mockResolvedValue(undefined);
    for (const collection of await connection.database.listCollections().toArray()) await connection.database.collection(collection.name).deleteMany({});
    vi.stubEnv("NEXTAUTH_SECRET", "local-authoring-test-secret"); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    seller = await repositories.users.create({ email: "seller@example.com", name: "Seller", emailVerified: new Date() });
    other = await repositories.users.create({ email: "other@example.com", name: "Other", emailVerified: new Date() });
    admin = await repositories.users.create({ email: "admin@example.com", name: "Moderator", emailVerified: new Date() });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "ADMIN" } });
    await repositories.assets.register({ id: "fixture:photo", userId: seller.id, kind: "PHOTO", listingId: null, url: image, bytes: 1024, format: "jpg" });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (connection) { await connection.database.dropDatabase(); await connection.close(); state.connection = undefined; }
  }, 30_000);

  const createDraft = (payload = complete, id = new ObjectId().toHexString(), saveKey = randomUUID(), owner = seller) => createListingDraft(owner.id, { id, payload, saveKey });
  const decide = (id: string, revision = 0, decision: "APPROVED" | "CHANGES_REQUESTED" = "APPROVED", actor = admin) => asUser(actor, () => review(request({ revision, decision, reason: decision === "CHANGES_REQUESTED" ? "Add the missing records." : "" }), context(id)));
  const openAuction = (id: string) => asUser(seller, () => start(request({ listingId: id, startingBid: 1000, bidIncrement: 100, endTime: new Date(Date.now() + 3600000).toISOString() })));
  async function rejectWrites(collection: string, operation: () => Promise<void>) {
    await connection.database.command({ collMod: collection, validator: { $expr: { $eq: [1, 0] } }, validationLevel: "strict", validationAction: "error" });
    try { await operation(); }
    finally { await connection.database.command({ collMod: collection, validator: {} }); }
  }

  it("persists incomplete drafts with BSON defaults and returns an explicit owner-free DTO", async () => {
    const draft = await createDraft(emptyDraftPayload);
    expect(draft).toMatchObject({ revision: 1, payload: emptyDraftPayload, publishedListingId: null });
    expect(draft).not.toHaveProperty("userId"); expect(draft).not.toHaveProperty("lastSaveKey");
    const raw = await connection.database.collection("ListingDraft").findOne({ _id: new ObjectId(draft.id) }, { promoteLongs: false });
    expect(raw?.userId).toEqual(new ObjectId(seller.id)); expect(Long.isLong(raw?.revision)).toBe(true);
    expect(raw?.deletedAt).toBeNull(); expect(raw?.publishedListingId).toBeNull(); expect(raw?.createdAt).toBeInstanceOf(Date);
    expect(await connection.database.collection("ListingDraft").findOne({ _id: new ObjectId(draft.id) }, { promoteLongs: false })).toMatchObject({ userId: new ObjectId(seller.id), revision: Long.fromNumber(1), payload: emptyDraftPayload });
    expect(await connection.database.collection("Listing").countDocuments()).toBe(0);
  });

  it("replays concurrent identical creates and rejects another owner's use of the same ID", async () => {
    const id = new ObjectId().toHexString(), saveKey = randomUUID();
    const results = await Promise.all([createDraft(emptyDraftPayload, id, saveKey), createDraft(emptyDraftPayload, id, saveKey)]);
    expect(results[0]).toEqual(results[1]); expect(await connection.database.collection("ListingDraft").countDocuments({})).toBe(1);
    await expect(createDraft(emptyDraftPayload, id, saveKey, other)).rejects.toMatchObject({ status: 404 });
    expect(await repositories.drafts.owned(id, other.id)).toBeNull();
  });

  it("replays identical concurrent saves and rejects competing changes without losing a revision", async () => {
    const draft = await createDraft(emptyDraftPayload);
    const payload = { ...emptyDraftPayload, details: { ...emptyDraftPayload.details, year: "not finished" } };
    const save = { revision: 1, saveKey: randomUUID(), payload };
    const results = await Promise.all([updateListingDraft(seller.id, draft.id, save), updateListingDraft(seller.id, draft.id, save)]);
    expect(results[0].revision).toBe(2); expect(results[1].revision).toBe(2);
    await expect(updateListingDraft(seller.id, draft.id, { ...save, payload: emptyDraftPayload })).rejects.toMatchObject({ status: 409 });
    const competing = await Promise.allSettled([
      updateListingDraft(seller.id, draft.id, { revision: 2, saveKey: randomUUID(), payload: emptyDraftPayload }),
      updateListingDraft(seller.id, draft.id, { revision: 2, saveKey: randomUUID(), payload: complete }),
    ]);
    expect(competing.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(competing.find((item) => item.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await repositories.drafts.owned(draft.id, seller.id))?.revision).toBe(3);
  });

  it("keeps deletion tombstones and prevents retries from resurrecting private content", async () => {
    const id = new ObjectId().toHexString(), saveKey = randomUUID();
    await createDraft(complete, id, saveKey);
    await expect(deleteListingDraft(other.id, id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(deleteListingDraft(seller.id, id, 2)).rejects.toMatchObject({ status: 409 });
    await deleteListingDraft(seller.id, id, 1);
    expect(await repositories.drafts.owned(id, seller.id)).toBeNull();
    const tombstone = (await repositories.drafts.find(id))!;
    expect(tombstone).toMatchObject({ revision: 2, payload: emptyDraftPayload, publishedListingId: null });
    expect(tombstone.deletedAt).toBeInstanceOf(Date);
    expect(() => serializeDraft(tombstone)).toThrow("Draft not found");
    await expect(createDraft(complete, id, saveKey)).rejects.toMatchObject({ status: 409 });
  });

  it("excludes absent draft markers while accepting explicit-null markers", async () => {
    const draft = await createDraft();
    await connection.database.collection("ListingDraft").updateOne({ _id: new ObjectId(draft.id) }, { $unset: { deletedAt: "" } });
    expect(await repositories.drafts.owned(draft.id, seller.id)).toBeNull();
    expect(await connection.database.collection("ListingDraft").findOne({ _id: new ObjectId(draft.id), userId: new ObjectId(seller.id) })).not.toHaveProperty("deletedAt");
    expect(await repositories.drafts.list(seller.id)).toEqual([]);
  });

  it.each(["missing", "null"])("preserves Prisma's read default for a %s draft revision without weakening write guards", async (kind) => {
    const draft = await createDraft();
    await connection.database.collection("ListingDraft").updateOne({ _id: new ObjectId(draft.id) }, kind === "missing" ? { $unset: { revision: "" } } : { $set: { revision: null } });
    expect((await repositories.drafts.owned(draft.id, seller.id))?.revision).toBe(1);
    expect((await connection.database.collection("ListingDraft").findOne({ _id: new ObjectId(draft.id) }, { promoteLongs: false }))?.revision).toBe(kind === "missing" ? undefined : null);
    await expect(updateListingDraft(seller.id, draft.id, { revision: 1, saveKey: randomUUID(), payload: complete })).rejects.toMatchObject({ status: 409 });
  });

  it("publishes a validated draft with complete BSON defaults and relation keys", async () => {
    const draft = await createDraft();
    const listing = await publishListingDraft(seller, draft.id, 1);
    expect(listing).toEqual({ id: listing.id });
    const raw = await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false });
    expect(raw).toMatchObject({ status: "UPCOMING", reviewStatus: "PENDING", reviewNote: null, result: null, isFeatured: false, auctionStartsAt: null, auctionEndsAt: null, currentBid: null, highestBidderId: null, images: [image], coverImage: image, biddersIds: [], watchersIds: [], seenIds: [], commentsIds: [], commenterIds: [] });
    for (const key of ["year", "miles", "views", "reviewRevision"]) expect(Long.isLong(raw?.[key])).toBe(true);
    expect(raw?.createdAt).toBeInstanceOf(Date); expect(raw?.updatedAt).toEqual(raw?.createdAt); expect(raw?.lastCommentAt).toEqual(raw?.createdAt);
    expect(await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false })).toMatchObject({ userId: new ObjectId(seller.id), year: Long.fromNumber(2020), views: Long.fromNumber(1), reviewRevision: Long.fromNumber(0), reservePrice: null });
    expect(await connection.database.collection("ListingDraft").findOne({ _id: new ObjectId(draft.id) }, { promoteLongs: false })).toMatchObject({ publishedListingId: new ObjectId(listing.id), revision: Long.fromNumber(1) });
    expect(raw).not.toHaveProperty("photoChecklist"); expect(raw).not.toHaveProperty("step");
  });

  it("publishes concurrent requests once and replays only the ID even after verification is revoked", async () => {
    const draft = await createDraft();
    const results = await Promise.all([publishListingDraft(seller, draft.id, 1), publishListingDraft(seller, draft.id, 1)]);
    expect(results[0]).toEqual(results[1]); expect(await connection.database.collection("Listing").countDocuments({})).toBe(1);
    await connection.database.collection("User").updateOne({ _id: new ObjectId(seller.id) }, { $set: { emailVerified: null } });
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(results[0].id) }, { $set: { status: "LIVE", watchersIds: [new ObjectId(other.id)], reservePrice: Long.fromNumber(9000), reviewNote: "Private feedback", futureSecret: "private" } });
    const response = await asUser(seller, () => submit(request({ draftId: draft.id, revision: 1, data: { make: "Unsaved change" } })));
    expect(response.status).toBe(201); expect(await response.json()).toEqual(results[0]);
    await expect(publishListingDraft(seller, draft.id, 2)).rejects.toMatchObject({ status: 409 });
    await expect(updateListingDraft(seller.id, draft.id, { revision: 1, saveKey: randomUUID(), payload: complete })).rejects.toMatchObject({ status: 409 });
  });

  it("rolls back listing creation if storing the publication link fails", async () => {
    const draft = await createDraft();
    await rejectWrites("ListingDraft", async () => {
      await expect(publishListingDraft(seller, draft.id, 1)).rejects.toMatchObject({ code: 121 });
      expect(await connection.database.collection("Listing").countDocuments({})).toBe(0);
      expect((await repositories.drafts.owned(draft.id, seller.id))?.publishedListingId).toBeNull();
    });
    expect(await publishListingDraft(seller, draft.id, 1)).toHaveProperty("id");
  });

  it("does not publish stale, incomplete, unverified, or other-owner drafts", async () => {
    const draft = await createDraft(emptyDraftPayload);
    await expect(publishListingDraft(seller, draft.id, 1)).rejects.toMatchObject({ status: 400 });
    await expect(publishListingDraft(seller, draft.id, 2)).rejects.toMatchObject({ status: 409 });
    await expect(publishListingDraft(other, draft.id, 1)).rejects.toMatchObject({ status: 404 });
    const full = await createDraft();
    await expect(publishListingDraft({ ...seller, emailVerified: null }, full.id, 1)).rejects.toMatchObject({ status: 403 });
    expect(await connection.database.collection("Listing").countDocuments({})).toBe(0);
  });

  it("arbitrates publication against an edit or deletion without orphan listings", async () => {
    for (const action of ["save", "delete"] as const) {
      const draft = await createDraft();
      const outcomes = await Promise.allSettled([
        publishListingDraft(seller, draft.id, 1),
        action === "save" ? updateListingDraft(seller.id, draft.id, { revision: 1, saveKey: randomUUID(), payload: complete }) : deleteListingDraft(seller.id, draft.id, 1),
      ]);
      expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      const saved = (await repositories.drafts.find(draft.id))!;
      if (saved.publishedListingId) expect(await repositories.listingAuthoring.ownedListing(saved.publishedListingId, seller.id)).not.toBeNull();
    }
    const linked = (await connection.database.collection("ListingDraft").find({}, { promoteLongs: false }).toArray()).filter((item) => item.publishedListingId);
    expect(await connection.database.collection("Listing").countDocuments({})).toBe(linked.length);
  });

  it("reads a historical BSON draft and publishes its stored snapshot", async () => {
    const id = new ObjectId().toHexString();
    const now = new Date();
    await connection.database.collection("ListingDraft").insertOne({ _id: new ObjectId(id), userId: new ObjectId(seller.id), payload: complete, revision: Long.ONE, lastSaveKey: randomUUID(), publishedListingId: null, deletedAt: null, createdAt: now, updatedAt: now });
    expect(serializeDraft((await repositories.drafts.owned(id, seller.id))!).payload).toEqual(complete);
    expect(await publishListingDraft(seller, id, 1)).toHaveProperty("id");
  });

  it("submits direct listings with owned media and strips seller-supplied approval", async () => {
    const response = await asUser(seller, () => submit(request({ data: { ...validated(), reviewStatus: "APPROVED", reviewRevision: 99, status: "LIVE", userId: other.id, views: 999 } })));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(await connection.database.collection("Listing").findOne({ _id: new ObjectId(id) }, { promoteLongs: false })).toMatchObject({ userId: new ObjectId(seller.id), status: "UPCOMING", reviewStatus: "PENDING", reviewRevision: Long.fromNumber(0), views: Long.fromNumber(1) });
    const bad = await asUser(other, () => submit(request({ data: validated() })));
    expect(bad.status).toBe(400); expect(await connection.database.collection("Listing").countDocuments({})).toBe(1);
  });

  it.each(["missing", "null", "zero"])("reviews legacy listings with a %s revision and stores a BSON audit", async (kind) => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    if (kind !== "zero") await connection.database.collection("Listing").updateOne({ _id: new ObjectId(listing.id) }, kind === "missing" ? { $unset: { reviewRevision: "" } } : { $set: { reviewRevision: null } });
    expect((await decide(listing.id)).status).toBe(200);
    expect(await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false })).toMatchObject({ reviewStatus: "APPROVED", reviewRevision: Long.fromNumber(1) });
    const raw = await connection.database.collection("ListingReview").findOne({}, { promoteLongs: false });
    expect(raw?.reviewerId).toEqual(new ObjectId(admin.id)); expect(raw?.listingId).toEqual(new ObjectId(listing.id)); expect(Long.isLong(raw?.revision)).toBe(true);
    expect(await connection.database.collection("ListingReview").findOne({}, { promoteLongs: false })).toMatchObject({ decision: "APPROVED", revision: Long.fromNumber(1), reviewerName: "Moderator", reason: null });
  });

  it("rolls back approval when its audit cannot be stored and denies revoked administrators", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    await rejectWrites("ListingReview", async () => {
      expect((await decide(listing.id)).status).toBe(500);
      expect(await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false })).toMatchObject({ reviewStatus: "PENDING", reviewRevision: Long.fromNumber(0) });
      expect(await connection.database.collection("ListingReview").countDocuments({})).toBe(0);
    });
    await connection.database.collection("User").updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: "USER" } });
    expect((await decide(listing.id)).status).toBe(403);
    await expect(asUser(admin, () => getReviewQueue())).rejects.toMatchObject({ status: 403 });
  });

  it("records one decision when moderators compete for the same revision", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    const results = await Promise.all([decide(listing.id), decide(listing.id, 0, "CHANGES_REQUESTED")]);
    expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(await connection.database.collection("ListingReview").countDocuments({})).toBe(1);
    expect((await repositories.listingAuthoring.find(listing.id))?.reviewRevision).toBe(1);
  });

  it("invalidates approval for cover, records, and gallery edits and freezes them after auction start", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    expect((await decide(listing.id)).status).toBe(200);
    const coverUrl = `https://res.cloudinary.com/demo/image/upload/listing-${listing.id}/cover.jpg`;
    await repositories.assets.register({ id: "fixture:cover", userId: seller.id, listingId: listing.id, kind: "PHOTO", url: coverUrl, bytes: 10, format: "jpg" });
    expect((await asUser(seller, () => cover(request({ url: coverUrl }), context(listing.id)))).status).toBe(200);
    expect(await connection.database.collection("Listing").findOne({ _id: new ObjectId(listing.id) }, { promoteLongs: false })).toMatchObject({ reviewStatus: "PENDING", reviewRevision: Long.fromNumber(2), coverImage: coverUrl, images: [image, coverUrl] });
    expect((await decide(listing.id, 1)).status).toBe(409);
    expect((await asUser(seller, () => records(request({ vin: "BCNR33-012345", vehicleRecords: [] }), context(listing.id)))).status).toBe(200);
    const extra = coverUrl.replace("cover.jpg", "detail.jpg");
    await repositories.assets.register({ id: "fixture:extra", userId: seller.id, listingId: listing.id, kind: "PHOTO", url: extra, bytes: 10, format: "jpg" });
    expect((await asUser(seller, () => photo(request({ listingId: listing.id, imageUrl: extra })))).status).toBe(200);
    expect((await repositories.listingAuthoring.find(listing.id))?.reviewRevision).toBe(4);
    expect((await openAuction(listing.id)).status).toBe(409);
    expect((await decide(listing.id, 4)).status).toBe(200);
    expect((await openAuction(listing.id)).status).toBe(201);
    expect((await asUser(seller, () => cover(request({ url: image }), context(listing.id)))).status).toBe(409);
    expect((await asUser(seller, () => records(request({ vin: "", vehicleRecords: [] }), context(listing.id)))).status).toBe(409);
    expect((await asUser(seller, () => photo(request({ listingId: listing.id, imageUrl: image })))).status).toBe(409);
  });

  it("prevents approval and auction start from racing past the same revision", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    expect((await decide(listing.id)).status).toBe(200);
    const results = await Promise.all([openAuction(listing.id), decide(listing.id, 1, "CHANGES_REQUESTED")]);
    const record = (await repositories.listingAuthoring.find(listing.id))!;
    if (record.status === "LIVE") {
      expect(results.map((item) => item.status)).toEqual([201, 409]); expect(record.reviewStatus).toBe("APPROVED");
      expect(await connection.database.collection("ListingReview").countDocuments({})).toBe(1);
    } else {
      expect(results.map((item) => item.status)).toEqual([409, 200]); expect(record.reviewStatus).toBe("CHANGES_REQUESTED");
      expect(await connection.database.collection("ListingReview").countDocuments({})).toBe(2);
    }
  });

  it("cannot leave a successful seller edit approved by a stale concurrent review", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    const [edited, reviewed] = await Promise.all([
      asUser(seller, () => records(request({ vin: "BCNR33-012345", vehicleRecords: [] }), context(listing.id))), decide(listing.id),
    ]);
    expect([200, 409]).toContain(edited.status); expect([200, 409]).toContain(reviewed.status);
    const record = (await repositories.listingAuthoring.find(listing.id))!;
    if (edited.status === 200) expect(record).toMatchObject({ reviewStatus: "PENDING", vin: "BCNR33-012345" });
    else expect(record.reviewStatus).toBe("APPROVED");
  });

  it("rejects wrong-owner media edits and hides unapproved galleries from other users", async () => {
    const listing = await repositories.listingAuthoring.create(seller.id, validated(), new Date());
    expect((await asUser(other, () => records(request({ vin: "", vehicleRecords: [] }), context(listing.id)))).status).toBe(403);
    const galleryRequest = () => new Request(`http://localhost/api/cloudinary-images?folder=listing-${listing.id}`);
    expect((await asUser(other, () => gallery(galleryRequest()))).status).toBe(404);
    expect((await asUser(seller, () => gallery(galleryRequest()))).status).toBe(200);
    expect((await decide(listing.id)).status).toBe(200);
    expect((await asUser(null, () => gallery(galleryRequest()))).status).toBe(200);
  });

  it("keeps the twenty-photo limit and revision guard when gallery additions compete", async () => {
    const images = Array.from({ length: 19 }, (_, index) => image.replace("car.jpg", `photo-${index}.jpg`));
    const listing = await repositories.listingAuthoring.create(seller.id, { ...validated(), images }, new Date());
    const urls = [image.replace("car.jpg", "new-a.jpg"), image.replace("car.jpg", "new-b.jpg")];
    for (const [index, url] of urls.entries()) await repositories.assets.register({ id: `fixture:gallery-${index}`, userId: seller.id, listingId: listing.id, kind: "PHOTO", url, bytes: 10, format: "jpg" });
    const responses = await Promise.all(urls.map((imageUrl) => asUser(seller, () => photo(request({ listingId: listing.id, imageUrl })))));
    expect(responses.map((item) => item.status).sort()).toEqual([200, 409]);
    const record = (await repositories.listingAuthoring.find(listing.id))!;
    expect(record.images).toHaveLength(20); expect(record.images.slice(0, 19)).toEqual(images);
    expect(record.reviewRevision).toBe(1);
  });

  it("bounds and filters the moderation queue, limits history, and projects seller contact safely", async () => {
    const ids: string[] = [];
    const base = Date.now() - 100000;
    for (let index = 0; index < 22; index++) ids.push((await repositories.listingAuthoring.create(seller.id, validated(), new Date(base + index))).id);
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(ids[0]) }, { $unset: { reviewStatus: "" } });
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(ids[1]) }, { $set: { reviewStatus: null } });
    const first = await asUser(admin, () => getReviewQueue());
    expect(first.listings.map((item) => item.id)).toEqual(ids.slice(0, 20)); expect(first.hasMore).toBe(true);
    expect(first.listings[0].user).toEqual({ name: "Seller" });
    expect((await asUser(admin, () => getReviewQueue(2))).listings.map((item) => item.id)).toEqual(ids.slice(20));
    await connection.database.collection("Listing").updateOne({ _id: new ObjectId(ids[0]) }, { $set: { futureSecret: "private" } });
    for (let index = 0; index < 55; index++) await repositories.listingAuthoring.addReview(ids[0], { revision: index, decision: "APPROVED", reason: "" }, { id: admin.id, name: admin.name }, new Date(base + index));
    const detail = await asUser(admin, () => getListingReview(ids[0]));
    expect(detail.user).toEqual({ name: "Seller", email: seller.email }); expect(detail).not.toHaveProperty("futureSecret");
    expect(detail.reviews).toHaveLength(50); expect(detail.reviews[0].revision).toBe(55);
    await expect(asUser(other, () => getListingReview(ids[0]))).rejects.toMatchObject({ status: 403 });
  });
});
