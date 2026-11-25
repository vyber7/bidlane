import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/app/libs/api-request";

const mocks = vi.hoisted(() => ({ user: vi.fn(), correct: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/listing-correction", () => ({ correctListing: mocks.correct }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { PATCH as details } from "./route";
import { PATCH as records } from "./vehicle-details/route";
import { POST as cover } from "./cover-image/route";
import { POST as photos } from "./photos/route";

const listingId = "abcdef0123456789abcdef01";
const url = `https://res.cloudinary.com/demo/image/upload/listing-${listingId}/detail.jpg`;
const call = (handler: typeof details, body: unknown, id = listingId) =>
  handler(new Request(`http://localhost/api/listing/${id}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

const routes = [
  { name: "details", handler: details, body: { revision: 3, data: { make: "Porsche" }, coverImage: url }, correction: { kind: "details", revision: 3, data: { make: "Porsche" }, coverImage: url }, response: { saved: true, reviewStatus: "PENDING", reviewRevision: 4 } },
  { name: "VIN and records", handler: records, body: { vin: "WP0", vehicleRecords: [] }, correction: { kind: "records", vin: "WP0", vehicleRecords: [] }, response: { saved: true } },
  { name: "cover photo", handler: cover, body: { url }, correction: { kind: "coverPhoto", url }, response: { message: "Cover image updated successfully", coverImageUrl: url } },
  { name: "gallery photo", handler: photos, body: { imageUrl: url }, correction: { kind: "galleryPhoto", url }, response: { message: "Image uploaded successfully", imageUrl: url } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "seller" });
  mocks.correct.mockResolvedValue({ changed: true, reviewStatus: "PENDING", reviewRevision: 4 });
});

describe.each(routes)("the $name Correction route", ({ handler, body, correction, response }) => {
  it("sends the signed-in seller's change through the Correction operation", async () => {
    const result = await call(handler, body);
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(response);
    expect(mocks.correct).toHaveBeenCalledWith({ listingId, sellerId: "seller" }, correction);
  });
  it("requires sign-in", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await call(handler, body)).status).toBe(401);
    expect(mocks.correct).not.toHaveBeenCalled();
  });
  it("rejects an invalid Listing id", async () => {
    expect((await call(handler, body, "bad")).status).toBe(400);
    expect(mocks.correct).not.toHaveBeenCalled();
  });
  it("returns the Correction's refusal", async () => {
    mocks.correct.mockRejectedValue(new ApiRequestError(409, "Listings cannot be edited after bidding opens."));
    const result = await call(handler, body);
    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toEqual({ error: "Listings cannot be edited after bidding opens." });
  });
});

it("acknowledges a gallery photo that is already saved", async () => {
  mocks.correct.mockResolvedValue({ changed: false, reviewStatus: "APPROVED", reviewRevision: 3 });
  await expect((await call(photos, { imageUrl: url })).json()).resolves.toEqual({ message: "Image already saved", imageUrl: url });
});
