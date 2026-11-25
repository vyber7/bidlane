import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assets: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createListing: vi.fn(), findListing: vi.fn(), transaction: vi.fn() }));
vi.mock("./native-repositories", () => ({
  getNativeRepositories: () => ({ assets: { findOwned: mocks.assets }, drafts: { find: mocks.findUnique, owned: mocks.findFirst, create: mocks.create, save: mocks.updateMany, remove: mocks.updateMany, markSubmitted: mocks.updateMany } }),
  withNativeTransaction: mocks.transaction,
}));
import { createDraft, updateDraft, deleteDraft, submitDraft } from "./listing-submission";
import { emptyDraftPayload } from "@/app/schemas/listing-draft";
const id = "abcdef0123456789abcdef01", key = "78f24991-f096-4e39-9a61-0eb03d28f1b6";
const payload = { ...emptyDraftPayload, details: { ...emptyDraftPayload.details, make: "Porsche" } };
const saved = { id, userId: "seller", payload, revision: 2, lastSaveKey: key, publishedListingId: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
const complete = { ...payload, details: { ...payload.details, year: "2020", model: "911", miles: "1000", location: "Miami", description: "One owner", transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "None known", modifications: "None known", knownFlaws: "None known" }, images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"] };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockResolvedValue([]); mocks.findUnique.mockResolvedValue(null); mocks.findFirst.mockResolvedValue(saved);
  mocks.create.mockImplementation(async (data) => ({ ...saved, ...data, revision: 1 }));
  mocks.updateMany.mockResolvedValue({ count: 1 }); mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.createListing.mockResolvedValue({ id: "listing", userId: "seller" }); mocks.findListing.mockResolvedValue({ id: "listing", userId: "seller" });
  mocks.transaction.mockImplementation(async (fn) => fn({ drafts: { find: mocks.findUnique, owned: mocks.findFirst, create: mocks.create, save: mocks.updateMany, remove: mocks.updateMany, markSubmitted: mocks.updateMany }, listingAuthoring: { create: mocks.createListing, ownedListing: mocks.findListing } }));
});
describe("Draft saving", () => {
  it("rejects unregistered photos and records in both creates and updates", async () => {
    for (const media of [{ images: complete.images }, { vehicleRecords: [{ label: "Receipt", url: complete.images[0] }] }]) {
      const changed = { ...payload, ...media };
      await expect(createDraft("seller", { id, saveKey: key, payload: changed })).rejects.toMatchObject({ status: 400 });
      await expect(updateDraft("seller", id, { revision: 2, saveKey: "new", payload: changed })).rejects.toMatchObject({ status: 400 });
    }
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("accepts registered uploads for a new Draft", async () => {
    mocks.assets.mockResolvedValue([{ url: complete.images[0] }]);
    expect((await createDraft("seller", { id, saveKey: key, payload: complete })).payload.images).toEqual(complete.images);
    expect(mocks.assets.mock.calls[0][0]).toMatchObject({ userId: "seller", kind: "PHOTO", listingId: undefined });
  });
  it("allows edits to legacy Drafts without reuploading exact saved media", async () => {
    const legacy = { ...complete, vehicleRecords: [{ label: "", url: complete.images[0] }] };
    mocks.findFirst.mockResolvedValue({ ...saved, payload: legacy });
    await updateDraft("seller", id, { revision: 2, saveKey: "new", payload: { ...legacy, vehicleRecords: [{ label: "Renamed receipt", url: complete.images[0] }] } });
    expect(mocks.assets).not.toHaveBeenCalled(); expect(mocks.updateMany).toHaveBeenCalled();
  });
  it("saves unfinished fields in a separate owner-bound collection", async () => {
    const result = await createDraft("seller", { id, saveKey: key, payload });
    expect(mocks.create).toHaveBeenCalledWith({ id, userId: "seller", payload, lastSaveKey: key }, expect.any(Date));
    expect(result.payload.details.model).toBe(""); expect(result).not.toHaveProperty("userId"); expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("replays an uncertain create without duplicating the Draft", async () => {
    mocks.findUnique.mockResolvedValue(saved);
    expect((await createDraft("seller", { id, saveKey: key, payload })).revision).toBe(2); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not resurrect a deleted Draft after a lost create response", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved, deletedAt: new Date(), payload: emptyDraftPayload });
    await expect(createDraft("seller", { id, saveKey: key, payload })).rejects.toMatchObject({ status: 409 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not reveal another owner’s Draft", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved, userId: "other" });
    await expect(createDraft("seller", { id, saveKey: key, payload })).rejects.toMatchObject({ status: 404 });
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateDraft("seller", id, { revision: 2, saveKey: key, payload })).rejects.toMatchObject({ status: 404 });
  });
  it("guards updates against stale revisions and strips no incomplete input", async () => {
    const changed = { ...payload, details: { ...payload.details, year: "not finished" } };
    await updateDraft("seller", id, { revision: 2, saveKey: "b".repeat(36), payload: changed });
    expect(mocks.updateMany).toHaveBeenCalledWith(id, "seller", 2, { payload: changed, lastSaveKey: "b".repeat(36) }, expect.any(Date));
    await expect(updateDraft("seller", id, { revision: 1, saveKey: "different", payload })).rejects.toMatchObject({ status: 409 });
  });
  it("returns the recorded revision on a save replay and rejects changed data with the same key", async () => {
    expect((await updateDraft("seller", id, { revision: 1, saveKey: key, payload })).revision).toBe(2);
    await expect(updateDraft("seller", id, { revision: 2, saveKey: key, payload: emptyDraftPayload })).rejects.toMatchObject({ status: 409 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("recognizes a concurrent identical save after a failed compare-and-swap", async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...saved, revision: 1, lastSaveKey: "old" }).mockResolvedValueOnce(saved);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await updateDraft("seller", id, { revision: 1, saveKey: key, payload })).revision).toBe(2);
  });
  it("does not overwrite another tab’s successful save", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateDraft("seller", id, { revision: 2, saveKey: "new", payload })).rejects.toMatchObject({ status: 409 });
  });
  it("deletes only an unsubmitted Draft at the displayed revision", async () => {
    await deleteDraft("seller", id, 2);
    expect(mocks.updateMany).toHaveBeenCalledWith(id, "seller", 2, emptyDraftPayload, expect.any(Date));
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(deleteDraft("seller", id, 1)).rejects.toMatchObject({ status: 409 });
  });
});
describe("Submission", () => {
  it("requires verified email to submit a new Listing while preserving saved Drafts", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete });
    await expect(submitDraft({ id: "seller", emailVerified: null }, id, 2)).rejects.toMatchObject({ status: 403 });
    expect(mocks.createListing).not.toHaveBeenCalled();
    await updateDraft("seller", id, { revision: 2, saveKey: "new-key", payload: complete });
    expect(mocks.updateMany).toHaveBeenCalled();
  });
  it("acknowledges a previously submitted Draft without a new verification requirement", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, publishedListingId: "listing" });
    await expect(submitDraft({ id: "seller", emailVerified: null }, id, 2)).resolves.toMatchObject({ id: "listing" });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("validates saved content and creates the Listing and retry link in one transaction", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete });
    expect(await submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).toMatchObject({ id: "listing" });
    expect(mocks.createListing).toHaveBeenCalledWith("seller", expect.objectContaining({ year: 2020, make: "Porsche", miles: 1000, images: complete.images }), expect.any(Date));
    expect(mocks.updateMany).toHaveBeenCalledWith(id, "seller", 2, "listing", expect.any(Date));
    expect(mocks.createListing.mock.calls[0][1]).not.toHaveProperty("photoChecklist");
  });
  it("never submits an incomplete Draft or creates a Listing for a stale revision", async () => {
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).rejects.toMatchObject({ status: 400 });
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 1)).rejects.toMatchObject({ status: 409 });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("replays Submission with the same Listing instead of creating a second one", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, publishedListingId: "listing" });
    expect(await submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).toMatchObject({ id: "listing" }); expect(mocks.createListing).not.toHaveBeenCalled();
    await expect(updateDraft("seller", id, { revision: 2, saveKey: key, payload })).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back via the transaction if Submission loses the revision guard", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete }); mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).rejects.toMatchObject({ status: 409 });
  });
  it("refuses a deleted Draft or another seller's Draft as not found", async () => {
    // The owner read excludes deleted Drafts and Drafts owned by someone else.
    mocks.findFirst.mockResolvedValue(null);
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).rejects.toMatchObject({ status: 404, message: "Draft not found." });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("refuses a stale revision with the reload message", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: complete });
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 1)).rejects.toMatchObject({ status: 409, message: "This draft changed in another tab or device. Reload to see the latest saved version before editing again." });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("normalizes the saved Draft and keeps photo order", async () => {
    const second = complete.images[0].replace("car.jpg", "interior.jpg");
    const record = { label: " Receipt ", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" };
    mocks.findFirst.mockResolvedValue({ ...saved, payload: { ...complete, images: [second, complete.images[0]], vehicleRecords: [record], details: { ...complete.details, make: " Porsche ", vin: " bcnr33-012345 ", reservePrice: "", serviceHistory: " Oil service at 42,000 miles. " } } });
    await submitDraft({ id: "seller", emailVerified: new Date() }, id, 2);
    expect(mocks.createListing).toHaveBeenCalledWith("seller", expect.objectContaining({ make: "Porsche", vin: "BCNR33-012345", reservePrice: null, serviceHistory: "Oil service at 42,000 miles.", images: [second, complete.images[0]], vehicleRecords: [{ ...record, label: "Receipt" }] }), expect.any(Date));
  });
  it("creates the Listing Awaiting review even if the saved Draft carries Review or Auction fields", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: { ...complete, details: { ...complete.details, reviewStatus: "APPROVED", reviewRevision: 999, status: "LIVE", emailVerified: true } } });
    await submitDraft({ id: "seller", emailVerified: new Date() }, id, 2);
    for (const field of ["reviewStatus", "reviewRevision", "status", "emailVerified"]) expect(mocks.createListing.mock.calls[0][1]).not.toHaveProperty(field);
  });
  it.each([
    { transmission: "Invalid" }, { titleStatus: "" }, { serviceHistory: " " },
    { make: " " }, { year: "" }, { miles: "-1" }, { miles: "1.5" }, { reservePrice: "-5" }, { miles: "2147483648" },
  ])("refuses a Draft with invalid details %j", async (change) => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: { ...complete, details: { ...complete.details, ...change } } });
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).rejects.toMatchObject({ status: 400 });
    expect(mocks.createListing).not.toHaveBeenCalled();
  });
  it("accepts explicit unknown information", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: { ...complete, details: { ...complete.details, transmission: "Unknown", drivetrain: "Unknown", titleStatus: "Unknown", serviceHistory: "History unknown; records unavailable." } } });
    await submitDraft({ id: "seller", emailVerified: new Date() }, id, 2);
    expect(mocks.createListing).toHaveBeenCalledWith("seller", expect.objectContaining({ transmission: "Unknown", titleStatus: "Unknown" }), expect.any(Date));
  });
  it("refuses a Draft without photos", async () => {
    mocks.findFirst.mockResolvedValue({ ...saved, payload: { ...complete, images: [] } });
    await expect(submitDraft({ id: "seller", emailVerified: new Date() }, id, 2)).rejects.toMatchObject({ status: 400 });
  });
});

afterEach(() => vi.unstubAllEnvs());
