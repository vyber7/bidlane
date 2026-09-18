import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

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
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "seller" });
    mocks.findUnique.mockResolvedValue({ userId: "seller", images: [] });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("only reads folders belonging to real listings", async () => {
    expect((await GET(new Request("http://localhost/api/cloudinary-images?folder=all"))).status).toBe(400);

    mocks.findUnique.mockResolvedValue({ images: [imageUrl] });
    const response = await GET(
      new Request(`http://localhost/api/cloudinary-images?folder=${folder}`)
    );

    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: listingId },
      select: { images: true },
    });
    await expect(response.json()).resolves.toEqual({ images: [{ url: imageUrl }] });
  });

  it("requires authentication before saving an image", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects non-Cloudinary and wrong-folder images", async () => {
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

  it("forbids another user from changing the gallery", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "another-seller", images: [] });

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("enforces the image limit", async () => {
    mocks.findUnique.mockResolvedValue({
      userId: "seller",
      images: Array.from({ length: 10 }, (_, index) => `image-${index}`),
    });

    expect((await POST(post({ listingId, imageUrl }))).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("scopes an optimistic gallery write to the owner", async () => {
    const response = await POST(post({ listingId, imageUrl }));

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: listingId,
        userId: "seller",
        images: { equals: [] },
      },
      data: { images: { push: imageUrl } },
    });
  });
});
