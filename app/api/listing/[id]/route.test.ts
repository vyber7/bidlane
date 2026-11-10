import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assets: vi.fn(), user: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ assets: { findOwned: mocks.assets } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { listing: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { PATCH } from "./route";

const id = "abcdef0123456789abcdef01";
const photo = "https://res.cloudinary.com/demo/image/upload/car.jpg";
const data = { year: 2020, make: "Porsche", model: "911", miles: 100, location: "New York", description: "Updated description", reservePrice: null, vin: "", vehicleRecords: [], transmission: "Manual", drivetrain: "Rear-wheel drive", titleStatus: "Clean", serviceHistory: "Unknown", modifications: "None known", knownFlaws: "Paint chips", images: [photo] };
const patch = (body: unknown = { revision: 3, data }) => PATCH(new Request("http://localhost/api/listing", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockImplementation(async ({ urls }) => [photo].filter((url) => urls.includes(url)).map((url) => ({ url })));
  mocks.user.mockResolvedValue({ id: "seller" });
  mocks.findUnique.mockResolvedValue({ id, userId: "seller", status: "UPCOMING", reviewRevision: 3, reviewStatus: "APPROVED" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("seller listing corrections", () => {
  it("rejects an unregistered replacement photo", async () => {
    mocks.assets.mockResolvedValue([]);
    expect((await patch()).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("keeps an exact saved legacy photo even when no ledger row exists", async () => {
    mocks.findUnique.mockResolvedValue({ id, userId: "seller", status: "UPCOMING", reviewRevision: 3, images: [photo] });
    mocks.assets.mockResolvedValue([]);
    expect((await patch()).status).toBe(200); expect(mocks.assets).not.toHaveBeenCalled();
  });
  it("saves all corrections together and resubmits an approved listing for review", async () => {
    const response = await patch({ revision: 3, data: { ...data, reviewStatus: "APPROVED", status: "LIVE", userId: "buyer" } });
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id, userId: "seller", status: "UPCOMING", reviewRevision: 3 },
      data: { ...data, vin: null, coverImage: photo, reviewStatus: "PENDING", reviewRevision: 4, reviewNote: null },
    });
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("userId");
    expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty("status");
  });
  it("requires authentication", async () => { mocks.user.mockResolvedValue(null); expect((await patch()).status).toBe(401); expect(mocks.findUnique).not.toHaveBeenCalled(); });
  it("allows only the listing owner, even when the caller is an admin", async () => {
    mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
    expect((await patch()).status).toBe(403); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it.each(["LIVE", "ENDED"])("freezes all content for %s listings", async (status) => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status });
    expect((await patch()).status).toBe(409); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite a moderator decision or another seller edit from an old form", async () => {
    expect((await patch({ revision: 2, data })).status).toBe(409); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("does not overwrite a concurrent approval or auction start", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await patch()).status).toBe(409);
  });
  it.each([{ ...data, images: [] }, { ...data, knownFlaws: " " }, { ...data, miles: -1 }])("validates the complete corrected listing", async (data) => {
    expect((await patch({ revision: 3, data })).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("requires a revision", async () => { expect((await patch({ data })).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled(); });
});

afterEach(() => vi.unstubAllEnvs());
