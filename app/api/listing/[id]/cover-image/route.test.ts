import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  assets: vi.fn(),
}));

vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ assets: { findOwned: mocks.assets }, listingAuthoring: { find: mocks.findUnique, editCover: mocks.updateMany } }) }));
vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";
const imageUrl = `https://res.cloudinary.com/demo/image/upload/v1/listing-${listingId}/cover.jpg`;

function request(url: unknown = imageUrl) {
  return new Request(`http://localhost/api/listing/${listingId}/cover-image`, {
    method: "POST",
    body: JSON.stringify({ url }),
    headers: { "content-type": "application/json" },
  });
}

function context(id = listingId) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/listing/[id]/cover-image", () => {
  it("rejects an unregistered replacement cover", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, images: [] });
    mocks.assets.mockResolvedValue([]);
    expect((await POST(request(), context())).status).toBe(400); expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo"); mocks.assets.mockImplementation(async ({ urls }) => [imageUrl].filter((url) => urls.includes(url)).map((url) => ({ url })));
    mocks.getCurrentUser.mockResolvedValue({ id: "seller" });
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", reviewRevision: 2, images: [imageUrl] });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await POST(request(), context())).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["bad", imageUrl],
    [listingId, "https://example.com/image.jpg"],
    [listingId, "https://res.cloudinary.com/demo/image/upload/another-folder/image.jpg"],
  ])("rejects invalid target or image input", async (id, url) => {
    expect((await POST(request(url), context(id))).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns not found for a missing listing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    expect((await POST(request(), context())).status).toBe(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("forbids another user from updating the listing", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "another-seller" });

    expect((await POST(request(), context())).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("scopes the final write to the authenticated owner", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(listingId, "seller", 2, imageUrl, [imageUrl], expect.any(Date));
  });

  it.each(["LIVE", "ENDED"])("freezes the cover for %s auctions", async (status) => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status, images: [imageUrl] });
    expect((await POST(request(), context())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("saves a newly uploaded cover as a reviewed gallery photo too", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", images: [], reviewRevision: 2 });
    expect((await POST(request(), context())).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(listingId, "seller", 2, imageUrl, [], expect.any(Date));
  });

  it("enforces the photo limit when uploading a new cover", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "seller", status: "UPCOMING", images: Array(20).fill("other"), reviewRevision: 2 });
    expect((await POST(request(), context())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());
