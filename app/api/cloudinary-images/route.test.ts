import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ listingAuthoring: { find: mocks.findUnique } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/logger", () => ({
  logger: { error: vi.fn() },
}));

import { GET } from "./route";

const listingId = "abcdef0123456789abcdef01";
const folder = `listing-${listingId}`;
const imageUrl = `https://res.cloudinary.com/demo/image/upload/v1/${folder}/detail.jpg`;

describe("/api/cloudinary-images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "seller" });
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, images: [] });
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

  it("hides unapproved image lists from other users", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "buyer" });
    expect((await GET(new Request(`http://localhost/api/cloudinary-images?folder=${folder}`))).status).toBe(404);
  });

  it("no longer accepts gallery additions, which go through the Listing", async () => {
    expect(await import("./route")).not.toHaveProperty("POST");
  });
});
