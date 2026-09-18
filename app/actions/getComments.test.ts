import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("../libs/prismadb", () => ({
  default: { comment: { findMany: mocks.findMany } },
}));
vi.mock("../libs/logger", () => ({ logger: { error: vi.fn() } }));

import getComments from "./getComments";

describe("getComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("selects only the public author name", async () => {
    await getComments("abcdef0123456789abcdef01");

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { listingId: "abcdef0123456789abcdef01" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        image: true,
        createdAt: true,
        listingId: true,
        user: { select: { name: true } },
      },
    });
  });
});
