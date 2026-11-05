import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("./prismadb", () => ({ default: { uploadedAsset: mocks } }));
import { assertOwnedAssets, assertListingAssets } from "./uploaded-assets";
const url = "https://res.cloudinary.com/demo/image/upload/v1/bidlane/seller/photo/id.jpg";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.findMany.mockResolvedValue([]); });
afterEach(() => vi.unstubAllEnvs());
describe("uploaded asset ownership", () => {
  it("rejects an invented same-cloud URL and checks exact owner, purpose, and listing", async () => {
    await expect(assertOwnedAssets({ userId: "seller", kind: "PHOTO", urls: [url], listingId: "listing" })).rejects.toMatchObject({ status: 400 });
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { userId: "seller", kind: "PHOTO", url: { in: [url] }, OR: [{ listingId: null }, { listingId: "listing" }] }, select: { url: true } });
  });
  it.each([url.replace("/demo/", "/other/"), url + "?a=1", url + "#fragment", url.replace("https:", "http:"), "https://example.com/file.jpg", url.replace("res.cloudinary.com", "res.cloudinary.com.evil.test")])("rejects foreign or noncanonical URLs: %s", async (foreign) => {
    await expect(assertOwnedAssets({ userId: "seller", kind: "PHOTO", urls: [foreign] })).rejects.toMatchObject({ status: 400 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("accepts ledger assets and deduplicates the lookup", async () => {
    mocks.findMany.mockResolvedValue([{ url }]);
    await assertOwnedAssets({ userId: "seller", kind: "PHOTO", urls: [url, url] });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ userId: "seller", kind: "PHOTO", url: { in: [url] }, listingId: null });
  });
  it("preserves exact legacy files on the edited object without trusting other legacy URLs", async () => {
    const legacy = "https://res.cloudinary.com/old-cloud/image/upload/old.jpg";
    await assertListingAssets("seller", { images: [legacy], vehicleRecords: [{ label: "Renamed", url: legacy }] }, { images: [legacy], vehicleRecords: [{ label: "", url: legacy }] });
    expect(mocks.findMany).not.toHaveBeenCalled();
    await expect(assertListingAssets("seller", { images: [legacy] })).rejects.toMatchObject({ status: 400 });
    await expect(assertListingAssets("seller", { images: [], vehicleRecords: [{ url: legacy }] }, { images: [legacy] })).rejects.toMatchObject({ status: 400 });
  });
  it("checks records independently of photos", async () => {
    const record = url.replace(".jpg", ".pdf");
    mocks.findMany.mockResolvedValueOnce([{ url }]);
    await expect(assertListingAssets("seller", { images: [url], vehicleRecords: [{ label: "Receipt", url: record }] })).rejects.toMatchObject({ status: 400 });
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({ userId: "seller", kind: "RECORD", url: { in: [record] } });
  });
  it("fails closed without cloud configuration, allowing unchanged legacy avatars", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "");
    await expect(assertOwnedAssets({ userId: "seller", kind: "PROFILE", urls: [url] })).rejects.toMatchObject({ status: 503 });
    await assertOwnedAssets({ userId: "seller", kind: "PROFILE", urls: [url], existingUrls: [url] });
  });
});
