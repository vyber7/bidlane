import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createListing: vi.fn(), findListing: vi.fn(), transaction: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { listingDraft: mocks, $transaction: mocks.transaction } }));
import { createListingDraft, updateListingDraft, deleteListingDraft, publishListingDraft } from "./listing-drafts";
import { emptyDraftPayload } from "@/app/schemas/listing-draft";
const id = "abcdef0123456789abcdef01", key = "78f24991-f096-4e39-9a61-0eb03d28f1b6";
const payload = { ...emptyDraftPayload, details: { ...emptyDraftPayload.details, make: "Porsche" } };
const saved = { id, userId: "seller", payload, revision: 2, lastSaveKey: key, publishedListingId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
const complete = { ...payload, details: { ...payload.details, year: "2020", model: "911", miles: "1000", location: "Miami", description: "One owner", transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "None known", modifications: "None known", knownFlaws: "None known" }, images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.findUnique.mockResolvedValue(null); mocks.findFirst.mockResolvedValue(saved);
  mocks.create.mockImplementation(async ({ data }) => ({ ...saved, ...data, revision: 1 }));
  mocks.updateMany.mockResolvedValue({ count: 1 }); mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.createListing.mockResolvedValue({ id: "listing", userId: "seller" }); mocks.findListing.mockResolvedValue({ id: "listing", userId: "seller" });
  mocks.transaction.mockImplementation(async (fn) => fn({ listingDraft: mocks, listing: { create: mocks.createListing, findUnique: mocks.findListing } }));
});
describe("private draft persistence", () => {
  it("saves unfinished fields in a separate owner-bound collection", async () => {
    const result = await createListingDraft("seller", { id, saveKey: key, payload });
    expect(mocks.create).toHaveBeenCalledWith({ data: { id, userId: "seller", payload, lastSaveKey: key, publishedListingId: null, deletedAt: null } });
    expect(result.payload.details.model).toBe(""); expect(result).not.toHaveProperty("userId"); expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("replays an uncertain create without duplicating the draft", async () => {
    mocks.findUnique.mockResolvedValue(saved);
    expect((await createListingDraft("seller", { id, saveKey: key, payload })).revision).toBe(2); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not resurrect a deleted draft after a lost create response", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved, deletedAt: new Date(), payload: emptyDraftPayload });
    await expect(createListingDraft("seller", { id, saveKey: key, payload })).rejects.toMatchObject({ status: 409 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not reveal another owner’s draft", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved, userId: "other" });
    await expect(createListingDraft("seller", { id, saveKey: key, payload })).rejects.toMatchObject({ status: 404 });
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateListingDraft("seller", id, { revision: 2, saveKey: key, payload })).rejects.toMatchObject({ status: 404 });
  });
  it("guards updates against stale revisions and strips no incomplete input", async () => {
    const changed = { ...payload, details: { ...payload.details, year: "not finished" } };
    await updateListingDraft("seller", id, { revision: 2, saveKey: "b".repeat(36), payload: changed });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id, userId: "seller", revision: 2, publishedListingId: null, deletedAt: null }, data: expect.objectContaining({ payload: changed, revision: { increment: 1 } }) });
    await expect(updateListingDraft("seller", id, { revision: 1, saveKey: "different", payload })).rejects.toMatchObject({ status: 409 });
  });
  it("returns the recorded revision on a save replay and rejects changed data with the same key", async () => {
    expect((await updateListingDraft("seller", id, { revision: 1, saveKey: key, payload })).revision).toBe(2);
    await expect(updateListingDraft("seller", id, { revision: 2, saveKey: key, payload: emptyDraftPayload })).rejects.toMatchObject({ status: 409 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("recognizes a concurrent identical save after a failed compare-and-swap", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...saved, revision: 1, lastSaveKey: "old" }).mockResolvedValueOnce(saved);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await updateListingDraft("seller", id, { revision: 1, saveKey: key, payload })).revision).toBe(2);
  });
  it("does not overwrite another tab’s successful save", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateListingDraft("seller", id, { revision: 2, saveKey: "new", payload })).rejects.toMatchObject({ status: 409 });
  });
  it("deletes only an unpublished draft at the displayed revision", async () => {
    await deleteListingDraft("seller", id, 2);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id, userId: "seller", revision: 2, publishedListingId: null, deletedAt: null }, data: { deletedAt: expect.any(Date), payload: emptyDraftPayload, revision: { increment: 1 } } });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(deleteListingDraft("seller", id, 1)).rejects.toMatchObject({ status: 409 });
  });
});
describe("draft publication", () => {
  it("validates saved content and creates the listing and retry link in one transaction", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete });
    expect(await publishListingDraft("seller", id, 2)).toMatchObject({ id: "listing" });
    expect(mocks.createListing).toHaveBeenCalledWith({ data: expect.objectContaining({ year: 2020, make: "Porsche", miles: 1000, reviewStatus: "PENDING", reviewRevision: 0, coverImage: complete.images[0], user: { connect: { id: "seller" } } }) });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id, userId: "seller", revision: 2, publishedListingId: null, deletedAt: null }, data: { publishedListingId: "listing" } });
    expect(mocks.createListing.mock.calls[0][0].data).not.toHaveProperty("photoChecklist");
  });
  it("never publishes an incomplete draft or creates a listing for a stale revision", async () => {
    await expect(publishListingDraft("seller", id, 2)).rejects.toMatchObject({ status: 400 });
    await expect(publishListingDraft("seller", id, 1)).rejects.toMatchObject({ status: 409 });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("replays publication with the same listing instead of creating a second one", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, publishedListingId: "listing" });
    expect(await publishListingDraft("seller", id, 2)).toMatchObject({ id: "listing" }); expect(mocks.createListing).not.toHaveBeenCalled();
    await expect(updateListingDraft("seller", id, { revision: 2, saveKey: key, payload })).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back via the transaction if publication loses the revision guard", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete }); mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(publishListingDraft("seller", id, 2)).rejects.toMatchObject({ status: 409 });
  });
});
