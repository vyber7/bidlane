import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateListing } from "@/app/libs/listing-validation";
const mocks = vi.hoisted(() => ({ assets: vi.fn(), user: vi.fn(), create: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { uploadedAsset: { findMany: mocks.assets }, listing: { create: mocks.create } } }));
import { POST } from "./route";
const photo = "https://res.cloudinary.com/demo/image/upload/car.jpg";
const data = { make: " Porsche ", model: "911", year: "2020", miles: "0", reservePrice: "", location: "Miami, FL", description: "Serviced regularly", images: [photo], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: " Oil service at 42,000 miles. Records available. ", modifications: "None known", knownFlaws: "Stone chips on the hood" };
const request = (data: unknown) => new Request("http://localhost/api/new-listing", { method: "POST", body: JSON.stringify({ data }) });
describe("listing submission", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockImplementation(async ({ where }) => [photo, photo.replace("car.jpg", "interior.jpg"), "https://res.cloudinary.com/demo/image/upload/receipt.pdf"].filter((url) => where.url.in.includes(url)).map((url) => ({ url }))); mocks.user.mockResolvedValue({ id: "seller" }); mocks.create.mockResolvedValue({ id: "listing" }); });
  it("requires sign-in before saving", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request(data))).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("saves selected photos and cover with zero miles and no reserve", async () => {
    const response = await POST(request(data));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "listing" });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ make: "Porsche", miles: 0, reservePrice: null, images: [photo], coverImage: photo, user: { connect: { id: "seller" } } }) });
  });
  it.each([{ images: [photo.replace("car.jpg", "borrowed.jpg")] }, { vehicleRecords: [{ label: "Borrowed", url: photo.replace("car.jpg", "borrowed.pdf") }] }])("rejects media absent from the authenticated owner's ledger", async (media) => {
    expect((await POST(request({ ...data, ...media }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("ignores seller-supplied approval and submits to review", async () => {
    expect((await POST(request({ ...data, reviewStatus: "APPROVED", reviewRevision: 999, status: "LIVE" }))).status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ reviewStatus: "PENDING", reviewRevision: 0 });
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("status");
  });
  it("persists VIN and uploaded records while keeping verification server-owned", async () => {
    const record = { label: " Receipt ", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" };
    expect((await POST(request({ ...data, vin: " bcnr33-012345 ", vehicleRecords: [record], emailVerified: true }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ vin: "BCNR33-012345", vehicleRecords: [{ ...record, label: "Receipt" }] }) });
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("emailVerified");
  });
  it("preserves photo order and selected cover", async () => {
    const second = photo.replace("car.jpg", "interior.jpg");
    await POST(request({ ...data, images: [second, photo], reservePrice: "5000" }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ images: [second, photo], coverImage: second, reservePrice: 5000 }) });
  });
  it("saves normalized specifications and seller disclosures", async () => {
    expect((await POST(request(data))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "Oil service at 42,000 miles. Records available.", modifications: "None known", knownFlaws: "Stone chips on the hood" }) });
  });
  it.each([
    { transmission: "Invalid" }, { drivetrain: null }, { titleStatus: "" },
    { serviceHistory: " " }, { modifications: 12 }, { knownFlaws: [] },
    { serviceHistory: "a".repeat(4001) },
  ])("rejects incomplete or invalid vehicle disclosures", async (change) => {
    const response = await POST(request({ ...data, ...change }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("accepts explicit unknown information without inventing a condition claim", async () => {
    expect((await POST(request({ ...data, transmission: "Unknown", drivetrain: "Unknown", titleStatus: "Unknown", serviceHistory: "History unknown; records unavailable." }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ transmission: "Unknown", titleStatus: "Unknown", serviceHistory: "History unknown; records unavailable." }) });
  });
  it.each([{ images: [] }, { images: Array(21).fill(photo) }, { images: ["javascript:alert(1)"] }, { make: " " }, { year: "" }, { miles: -1 }, { miles: "1.5" }, { reservePrice: -5 }, { miles: 2147483648 }])("rejects invalid listing %j", async (change) => {
    const response = await POST(request({ ...data, ...change }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: validateListing({ ...data, ...change }) });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects malformed data", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("reports save failures", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request(data))).status).toBe(500);
  });
});

afterEach(() => vi.unstubAllEnvs());
