import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
const mocks = vi.hoisted(() => ({ user: vi.fn(), publish: vi.fn(), create: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => { throw new Error("Unexpected native database access in this test"); },
  withNativeTransaction: () => { throw new Error("Unexpected native transaction in this test"); },
}));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/listing-drafts", () => ({ publishListingDraft: mocks.publish }));
vi.mock("@/app/libs/prismadb", () => ({ default: { listing: { create: mocks.create } } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "./route";
const draftId = "abcdef0123456789abcdef01";
const request = (body: unknown) => new Request("http://localhost/api/new-listing", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller" }); mocks.publish.mockResolvedValue({ id: "published" }); });
describe("publish saved draft endpoint", () => {
  it("returns only the listing ID when replaying a published draft with accumulated private activity", async () => {
    const listing = { ...makeListing({ status: "LIVE", reservePrice: 98765, watchersIds: ["private-watcher"], seenIds: ["private-viewer"], reviewNote: "Private feedback" }), futureSecret: "secret" };
    mocks.publish.mockResolvedValueOnce(listing);
    const response = await POST(request({ draftId, revision: 3 }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: listing.id });
  });
  it("publishes only the authenticated owner’s saved snapshot, ignoring conflicting client listing data", async () => {
    const response = await POST(request({ draftId, revision: 3, data: { make: "Unsaved data", userId: "other" } }));
    expect(response.status).toBe(201); expect(mocks.publish).toHaveBeenCalledWith({ id: "seller" }, draftId, 3); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires a valid draft ID and revision", async () => {
    expect((await POST(request({ draftId, revision: 0 }))).status).toBe(400); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("returns a retryable result for transactional contention", async () => {
    mocks.publish.mockRejectedValueOnce({ code: "P2034" }); expect((await POST(request({ draftId, revision: 3 }))).status).toBe(503);
  });
});
