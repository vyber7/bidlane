import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeListing } from "@/app/test/auction-fixtures";
import { TransactionRetryLimitError } from "@/prisma/native/transaction-errors";
const mocks = vi.hoisted(() => ({ user: vi.fn(), submit: vi.fn() }));
vi.mock("@/app/libs/native-repositories", () => ({
  getNativeRepositories: () => { throw new Error("Unexpected native database access in this test"); },
  withNativeTransaction: () => { throw new Error("Unexpected native transaction in this test"); },
}));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/listing-submission", () => ({ submitDraft: mocks.submit }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "./route";
const draftId = "abcdef0123456789abcdef01";
const request = (body: unknown) => new Request("http://localhost/api/new-listing", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "seller" }); mocks.submit.mockResolvedValue({ id: "submitted" }); });
describe("Submission endpoint", () => {
  it("returns only the listing ID when replaying a submitted Draft with accumulated private activity", async () => {
    const listing = { ...makeListing({ status: "LIVE", reservePrice: 98765, watchersIds: ["private-watcher"], seenIds: ["private-viewer"], reviewNote: "Private feedback" }), futureSecret: "secret" };
    mocks.submit.mockResolvedValueOnce(listing);
    const response = await POST(request({ draftId, revision: 3 }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: listing.id });
  });
  it("submits only the authenticated owner’s saved Draft, ignoring listing data sent alongside it", async () => {
    const response = await POST(request({ draftId, revision: 3, data: { make: "Unsaved data", userId: "other" } }));
    expect(response.status).toBe(201); expect(mocks.submit).toHaveBeenCalledWith({ id: "seller" }, draftId, 3);
  });
  it("requires sign-in", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request({ draftId, revision: 3 }))).status).toBe(401); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("rejects listing data sent without a Draft", async () => {
    const data = { make: "Porsche", model: "911", year: "2020", miles: "0", location: "Miami, FL", description: "Serviced", images: ["https://res.cloudinary.com/demo/image/upload/car.jpg"] };
    expect((await POST(request({ data }))).status).toBe(400); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("rejects malformed bodies", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/new-listing", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("reports unexpected failures", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("database unavailable")); expect((await POST(request({ draftId, revision: 3 }))).status).toBe(500);
  });
  it("requires a valid draft ID and revision", async () => {
    expect((await POST(request({ draftId, revision: 0 }))).status).toBe(400); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("returns a retryable result for transactional contention", async () => {
    mocks.submit.mockRejectedValueOnce(new TransactionRetryLimitError()); expect((await POST(request({ draftId, revision: 3 }))).status).toBe(503);
  });
});
