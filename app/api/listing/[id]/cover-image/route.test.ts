import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/app/actions/getCurrentUser", () => ({
  default: mocks.getCurrentUser,
}));
vi.mock("../../../../libs/prismadb", () => ({
  default: {
    listing: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "seller" });
    mocks.findUnique.mockResolvedValue({ userId: "seller" });
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
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: listingId, userId: "seller" },
      data: { coverImage: imageUrl },
    });
  });
});
