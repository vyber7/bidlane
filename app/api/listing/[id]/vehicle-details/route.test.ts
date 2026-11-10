import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ assets: vi.fn(), user: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ assets: { findOwned: mocks.assets }, listingAuthoring: { find: mocks.findUnique, editRecords: mocks.updateMany } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { listing: mocks } }));
vi.mock("@/app/libs/logger", () => ({ logger: { warn: vi.fn() } }));
import { PATCH } from "./route";
const id = "abcdef0123456789abcdef01";
const details = { vin: " wp0ab2997ys123456 ", vehicleRecords: [{ label: " Service receipt ", url: "https://res.cloudinary.com/demo/image/upload/receipt.pdf" }] };
const patch = (body: unknown = details) => PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockImplementation(async ({ urls }) => [details.vehicleRecords[0].url].filter((url) => urls.includes(url)).map((url) => ({ url }))); mocks.user.mockResolvedValue({ id: "seller" }); mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", year: 2000, reviewRevision: 2 }); mocks.updateMany.mockResolvedValue({ count: 1 }); });
describe("VIN and record edits", () => {
  it("rejects an unregistered replacement record", async () => {
    mocks.assets.mockResolvedValue([]);
    expect((await patch()).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("preserves and renames saved legacy records", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, vehicleRecords: details.vehicleRecords });
    mocks.assets.mockResolvedValue([]);
    expect((await patch()).status).toBe(200); expect(mocks.assets).not.toHaveBeenCalled();
  });
  it("normalizes and saves only for the upcoming listing’s owner", async () => {
    expect((await patch()).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(id, "seller", 2, { vin: "WP0AB2997YS123456", vehicleRecords: [{ ...details.vehicleRecords[0], label: "Service receipt" }] }, expect.any(Date));
  });
  it("supports removing records and clearing the VIN before auction start", async () => {
    expect((await patch({ vin: "", vehicleRecords: [] })).status).toBe(200);
    expect(mocks.updateMany.mock.calls[0][3]).toEqual({ vin: null, vehicleRecords: [] });
  });
  it("requires authentication", async () => { mocks.user.mockResolvedValue(null); expect((await patch()).status).toBe(401); expect(mocks.findUnique).not.toHaveBeenCalled(); });
  it("rejects another user", async () => { mocks.user.mockResolvedValue({ id: "buyer" }); expect((await patch()).status).toBe(403); expect(mocks.updateMany).not.toHaveBeenCalled(); });
  it("handles deleted listings", async () => { mocks.findUnique.mockResolvedValue(null); expect((await patch()).status).toBe(404); });
  it.each(["LIVE", "ENDED"])("freezes disclosures for %s auctions", async (status) => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status, year: 2000 });
    expect((await patch()).status).toBe(409); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("guards against auction start racing the edit", async () => { mocks.updateMany.mockResolvedValue({ count: 0 }); expect((await patch()).status).toBe(409); });
  it.each([
    { vin: "<script>", vehicleRecords: [] },
    { vin: "", vehicleRecords: [{ label: "Bad", url: "javascript:alert(1)" }] },
    { vin: "", vehicleRecords: [{ label: " ", url: details.vehicleRecords[0].url }] },
    { vin: "", vehicleRecords: Array(11).fill(details.vehicleRecords[0]) },
  ])("rejects invalid disclosures", async (body) => {
    expect((await patch(body)).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());
