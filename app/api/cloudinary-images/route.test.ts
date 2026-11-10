import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  assets: vi.fn(),
}));

vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ assets: { findOwned: mocks.assets }, listingAuthoring: { find: mocks.findUnique, addPhoto: mocks.updateMany } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("../../libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { error: vi.fn() },
}));

import { GET, POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const folder = `listing-${listingId}`;
const imageUrl = `https://res.cloudinary.com/demo/image/upload/v1/${folder}/detail.jpg`;

function post(body: unknown) {
  return new Request("http://localhost/api/cloudinary-images", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/cloudinary-images", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockImplementation(async ({ urls }) => [imageUrl].filter((url) => urls.includes(url)).map((url) => ({ url })));
    mocks.getCurrentUser.mockResolvedValue({ id: "seller" });
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, images: [] });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("only reads folders belonging to real listings", async () => {
    expect((await GET(new Request("http://localhost/api/cloudinary-images?folder=all"))).status).toBe(400);

    mocks.findUnique.mockResolvedValue({ status: "LIVE", userId: "seller", images: [imageUrl] });
    const response = await GET(
      new Request(`http://localhost/api/cloudinary-images?folder=${folder}`)
    );

    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith(listingId);
    await expect(response.json()).resolves.toEqual({ images: [{ url: imageUrl }] });
  });

  it("requires authentication before saving an image", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("hides unapproved image lists from other users", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "buyer" });
    expect((await GET(new Request(`http://localhost/api/cloudinary-images?folder=${folder}`))).status).toBe(404);
  });

  it.each(["LIVE", "ENDED"])("freezes gallery content for %s auctions", async (status) => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", images: [], status });
    expect((await POST(post({ listingId, imageUrl }))).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects non-Cloudinary and unregistered images", async () => {
    for (const invalidUrl of [
      "https://example.com/image.jpg",
      "https://res.cloudinary.com/demo/image/upload/another-folder/image.jpg",
    ]) {
      expect(
        (await POST(post({ listingId, imageUrl: invalidUrl }))).status
      ).toBe(400);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a same-cloud photo not registered to this account", async () => {
    mocks.assets.mockResolvedValue([]);
    expect((await POST(post({ listingId, imageUrl }))).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("forbids another user from changing the gallery", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "another-seller", images: [] });

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("enforces the image limit", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "seller", status: "UPCOMING", reviewRevision: 2,
      images: Array.from({ length: 20 }, (_, index) => `image-${index}`),
    });

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("allows the twentieth image", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, images: Array.from({ length: 19 }, (_, index) => `image-${index}`) });
    expect((await POST(post({ listingId, imageUrl }))).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
  });

  it("scopes an optimistic gallery write to the owner", async () => {
    const response = await POST(post({ listingId, imageUrl }));

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(listingId, "seller", 2, [], imageUrl, expect.any(Date));
  });
});

afterEach(() => vi.unstubAllEnvs());
