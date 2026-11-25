import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredListing = Record<string, unknown> & { id: string; userId: string; status: string; reviewRevision: number; images: string[] };
const store = vi.hoisted(() => ({ listings: new Map<string, StoredListing>(), assets: new Set<string>(), beforeSave: undefined as (() => void) | undefined }));
vi.mock("./native-repositories", () => ({
  getNativeRepositories: () => ({
    assets: {
      findOwned: async ({ userId, urls }: { userId: string; urls: string[] }) =>
        urls.filter((url) => store.assets.has(`${userId}:${url}`)).map((url) => ({ url })),
    },
    listingAuthoring: {
      find: async (id: string) => structuredClone(store.listings.get(id) ?? null),
      // Mirrors the guarded save: only the seller's Upcoming Listing at the loaded revision changes.
      saveCorrection: async (id: string, userId: string, revision: number, changes: Record<string, unknown>) => {
        store.beforeSave?.();
        const listing = store.listings.get(id);
        if (!listing || listing.userId !== userId || listing.status !== "UPCOMING" || listing.reviewRevision !== revision) return { count: 0 };
        store.listings.set(id, { ...listing, ...structuredClone(changes) });
        return { count: 1 };
      },
    },
  }),
}));
import { correctListing, type Correction } from "./listing-correction";

const listingId = "abcdef0123456789abcdef01";
const seller = "seller";
const target = { listingId, sellerId: seller };
const photo = (name: string) => `https://res.cloudinary.com/demo/image/upload/listing-${listingId}/${name}.jpg`;
const record = { label: "Service receipt", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" };
const details = { year: 2020, make: "Porsche", model: "911", miles: 100, location: "New York", description: "Updated description", reservePrice: null, vin: "", vehicleRecords: [], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "Unknown", modifications: "None known", knownFlaws: "Paint chips", images: [photo("car")] };
const saved = (): StoredListing => ({ ...details, id: listingId, userId: seller, status: "UPCOMING", reviewStatus: "APPROVED", reviewNote: "Looks good", reviewRevision: 3, images: [photo("car")], coverImage: photo("car"), vehicleRecords: null, vin: null });
const listing = () => store.listings.get(listingId)!;
const own = (...urls: string[]) => urls.forEach((url) => store.assets.add(`${seller}:${url}`));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
  store.listings.clear(); store.assets.clear(); store.beforeSave = undefined;
  store.listings.set(listingId, saved());
});
afterEach(() => vi.unstubAllEnvs());

describe("a details Correction", () => {
  it("saves the corrected details and returns the Listing to Awaiting review", async () => {
    await correctListing(target, { kind: "details", revision: 3, data: { ...details, model: "911 Turbo" } });
    expect(listing()).toMatchObject({ model: "911 Turbo", reviewStatus: "PENDING", reviewNote: null, reviewRevision: 4 });
  });
  it("keeps saved records when the corrected details leave them out", async () => {
    store.listings.set(listingId, { ...saved(), vehicleRecords: [record] });
    const { vehicleRecords: _omitted, ...withoutRecords } = details;
    await correctListing(target, { kind: "details", revision: 3, data: withoutRecords });
    expect(listing().vehicleRecords).toEqual([record]);
  });
  it("keeps the chosen cover when it is still in the gallery, and falls back to the first photo", async () => {
    own(photo("second"));
    const images = [photo("car"), photo("second")];
    await correctListing(target, { kind: "details", revision: 3, data: { ...details, images }, coverImage: photo("second") });
    expect(listing().coverImage).toBe(photo("second"));
    await correctListing(target, { kind: "details", revision: 4, data: { ...details, images }, coverImage: photo("gone") });
    expect(listing().coverImage).toBe(photo("car"));
  });
});

describe("a VIN and records Correction", () => {
  it("normalizes the VIN, saves the records and returns the Listing to Awaiting review", async () => {
    own(record.url);
    await correctListing(target, { kind: "records", vin: " wp0ab2997ys123456 ", vehicleRecords: [{ ...record, label: " Service receipt " }] });
    expect(listing()).toMatchObject({ vin: "WP0AB2997YS123456", vehicleRecords: [record], reviewStatus: "PENDING", reviewNote: null, reviewRevision: 4 });
  });
});

describe("a cover photo Correction", () => {
  it("sets the cover, adds a new upload to the gallery and returns the Listing to Awaiting review", async () => {
    own(photo("cover"));
    await correctListing(target, { kind: "coverPhoto", url: photo("cover") });
    expect(listing()).toMatchObject({ coverImage: photo("cover"), images: [photo("car"), photo("cover")], reviewStatus: "PENDING", reviewNote: null, reviewRevision: 4 });
  });
});

describe("a gallery photo Correction", () => {
  it("adds the photo and returns the Listing to Awaiting review", async () => {
    own(photo("detail"));
    expect(await correctListing(target, { kind: "galleryPhoto", url: photo("detail") })).toMatchObject({ changed: true });
    expect(listing()).toMatchObject({ images: [photo("car"), photo("detail")], reviewStatus: "PENDING", reviewNote: null, reviewRevision: 4 });
  });
  it("succeeds without changing anything when the photo is already in the gallery", async () => {
    expect(await correctListing(target, { kind: "galleryPhoto", url: photo("car") })).toMatchObject({ changed: false });
    expect(listing()).toEqual(saved());
  });
});

const everyKind: [Correction["kind"], () => Correction][] = [
  ["details", () => ({ kind: "details", revision: 3, data: details })],
  ["records", () => ({ kind: "records", vin: "", vehicleRecords: [] })],
  ["coverPhoto", () => { own(photo("cover")); return { kind: "coverPhoto", url: photo("cover") }; }],
  ["galleryPhoto", () => { own(photo("detail")); return { kind: "galleryPhoto", url: photo("detail") }; }],
];

describe.each(everyKind)("every Correction (%s)", (_, change) => {
  it("hides an Approved Listing until it is approved again", async () => {
    await correctListing(target, change());
    expect(listing()).toMatchObject({ reviewStatus: "PENDING", reviewNote: null, reviewRevision: 4 });
  });
  it("is refused when the Listing no longer exists", async () => {
    store.listings.clear();
    await expect(correctListing(target, change())).rejects.toMatchObject({ status: 404, message: "Listing not found." });
  });
  it("is refused when a Review or another Correction lands after the Listing was loaded", async () => {
    const correction = change();
    const reviewed = { ...saved(), reviewStatus: "CHANGES_REQUESTED", reviewNote: "Add the missing records.", reviewRevision: 4 };
    store.beforeSave = () => store.listings.set(listingId, reviewed);
    await expect(correctListing(target, correction)).rejects.toMatchObject({ status: 409, message: "This listing changed. Reload before editing again." });
    expect(listing()).toEqual(reviewed);
  });
});

const detailsCorrection: Correction = { kind: "details", revision: 3, data: details };

describe("refused Corrections", () => {
  // Who may correct, and when, is the Listing capabilities table's job. These
  // prove the command asks it and maps each refusal to its status and message.
  it("refuses anyone but the seller, even an administrator", async () => {
    await expect(correctListing({ listingId, sellerId: "admin" }, detailsCorrection)).rejects.toMatchObject({ status: 403, message: "Only the seller can edit this listing." });
    expect(listing()).toEqual(saved());
  });
  it("refuses once bidding opens", async () => {
    store.listings.set(listingId, { ...saved(), status: "LIVE" });
    await expect(correctListing(target, detailsCorrection)).rejects.toMatchObject({ status: 409, message: "Listings cannot be edited after bidding opens." });
    expect(listing()).toEqual({ ...saved(), status: "LIVE" });
  });
  it("refuses details from a page loaded at an older revision", async () => {
    await expect(correctListing(target, { kind: "details", revision: 2, data: details })).rejects.toMatchObject({ status: 409, message: "This listing changed. Reload before editing again." });
    expect(listing()).toEqual(saved());
  });
  it.each<[Correction["kind"], () => Correction]>([
    ["details", () => ({ kind: "details", revision: 3, data: { ...details, images: [photo("car"), photo("stranger")] } })],
    ["records", () => ({ kind: "records", vin: "", vehicleRecords: [record] })],
    ["coverPhoto", () => ({ kind: "coverPhoto", url: photo("stranger") })],
    ["galleryPhoto", () => ({ kind: "galleryPhoto", url: photo("stranger") })],
  ])("refuses photos and records the seller did not upload (%s)", async (_, change) => {
    store.assets.add(`other:${photo("stranger")}`); store.assets.add(`other:${record.url}`);
    await expect(correctListing(target, change())).rejects.toMatchObject({ status: 400 });
    expect(listing()).toEqual(saved());
  });
  it("keeps a saved photo the ledger never registered", async () => {
    await correctListing(target, { kind: "details", revision: 3, data: { ...details, make: "Ruf" } });
    expect(listing().make).toBe("Ruf");
  });
  it.each([
    ["coverPhoto", "cover"],
    ["galleryPhoto", "detail"],
  ] as const)("keeps the photo limit for %s additions", async (kind, name) => {
    const full = Array.from({ length: 20 }, (_, index) => photo(`photo-${index}`));
    store.listings.set(listingId, { ...saved(), images: full });
    own(photo(name));
    await expect(correctListing(target, { kind, url: photo(name) })).rejects.toMatchObject({ status: 409, message: "This listing already has the maximum number of images" });
    expect(listing().images).toEqual(full);
  });
  it("allows the twentieth photo", async () => {
    const nineteen = Array.from({ length: 19 }, (_, index) => photo(`photo-${index}`));
    store.listings.set(listingId, { ...saved(), images: nineteen });
    own(photo("detail"));
    await correctListing(target, { kind: "galleryPhoto", url: photo("detail") });
    expect(listing().images).toHaveLength(20);
  });
  const invalid: Correction[] = [
    { kind: "details", revision: 3, data: { ...details, images: [] } },
    { kind: "details", revision: 3, data: { ...details, knownFlaws: " " } },
    { kind: "details", revision: undefined, data: details },
    { kind: "records", vin: "<script>", vehicleRecords: [] },
    { kind: "records", vin: "", vehicleRecords: [{ label: "Bad", url: "javascript:alert(1)" }] },
    { kind: "coverPhoto", url: "https://example.com/image.jpg" },
    { kind: "galleryPhoto", url: "https://res.cloudinary.com/demo/image/upload/another-folder/image.jpg" },
  ];
  it.each(invalid)("refuses invalid input %#", async (change: Correction) => {
    await expect(correctListing(target, change)).rejects.toMatchObject({ status: 400 });
    expect(listing()).toEqual(saved());
  });
});
