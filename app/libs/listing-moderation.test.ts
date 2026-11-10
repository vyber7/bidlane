import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("./prismadb", () => ({ default: { listing: { findMany: mocks.findMany, findUnique: mocks.findUnique } } }));
vi.mock("@/app/libs/native-repositories", () => ({ getNativeRepositories: () => ({ listingAuthoring: { reviewQueue: mocks.findMany, reviewDetail: mocks.findUnique } }) }));
import { getListingReview, getReviewQueue } from "./listing-moderation";

beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" }); mocks.findMany.mockResolvedValue([]); mocks.findUnique.mockResolvedValue(null); });

describe("admin listing review data", () => {
  it.each([null, { id: "user", role: "USER" }])("protects queue and history reads for %j", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(getReviewQueue()).rejects.toHaveProperty("status", user ? 403 : 401);
    await expect(getListingReview("id")).rejects.toHaveProperty("status", user ? 403 : 401);
    expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("includes legacy upcoming listings in the pending queue and paginates oldest first", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 21 }, (_, id) => ({ id })));
    const result = await getReviewQueue(2);
    expect(result.hasMore).toBe(true); expect(result.listings).toHaveLength(20);
    expect(mocks.findMany).toHaveBeenCalledWith(2, "PENDING");
  });
  it("lets admins revisit approved listings to request changes", async () => {
    await getReviewQueue(1, "APPROVED");
    expect(mocks.findMany).toHaveBeenCalledWith(1, "APPROVED");
  });
  it("loads review history with seller contact only after admin authorization", async () => {
    mocks.findUnique.mockResolvedValue({ id: "listing", reviews: [] });
    expect(await getListingReview("listing")).toHaveProperty("id", "listing");
    expect(mocks.findUnique).toHaveBeenCalledWith("listing");
  });
});
