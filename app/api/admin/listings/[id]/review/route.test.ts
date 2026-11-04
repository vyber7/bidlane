import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn(), transaction: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/prismadb", () => ({ default: { $transaction: mocks.transaction } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "./route";

const id = "abcdef0123456789abcdef01";
const submit = (body: unknown = { revision: 3, decision: "APPROVED" }) => POST(new Request("http://localhost/api/admin/listings/review", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", name: "Moderator" });
  mocks.findUnique.mockResolvedValue({ id, userId: "seller", status: "UPCOMING", reviewRevision: 3, reviewStatus: "PENDING" });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.create.mockResolvedValue({ id: "review" });
  mocks.transaction.mockImplementation(async (callback) => callback({ listing: { findUnique: mocks.findUnique, updateMany: mocks.updateMany }, listingReview: { create: mocks.create } }));
});

describe("listing moderation decisions", () => {
  it.each([[null, 401], [{ id: "buyer", role: "USER" }, 403]])("rejects unauthorized callers before any data access", async (user, status) => {
    mocks.user.mockResolvedValue(user);
    expect((await submit()).status).toBe(status);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("approves the reviewed version and records who reviewed it in the same transaction", async () => {
    expect((await submit()).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id, status: "UPCOMING", reviewRevision: 3 }, data: { reviewStatus: "APPROVED", reviewNote: null, reviewRevision: 4 } });
    expect(mocks.create).toHaveBeenCalledWith({ data: { listingId: id, reviewerId: "admin", reviewerName: "Moderator", decision: "APPROVED", reason: null, revision: 4 } });
  });
  it("saves actionable feedback and revokes approval when changes are requested", async () => {
    mocks.findUnique.mockResolvedValue({ id, userId: "seller", status: "UPCOMING", reviewRevision: 3, reviewStatus: "APPROVED" });
    expect((await submit({ revision: 3, decision: "CHANGES_REQUESTED", reason: "  Show the title status and underbody photos.  " })).status).toBe(200);
    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({ reviewStatus: "CHANGES_REQUESTED", reviewNote: "Show the title status and underbody photos.", reviewRevision: 4 });
  });
  it.each([
    { revision: 3, decision: "CHANGES_REQUESTED", reason: " " },
    { revision: 3, decision: "APPROVED", reason: "a".repeat(2001) },
    { revision: -1, decision: "APPROVED" }, { decision: "APPROVED" },
    { revision: 3, decision: "LIVE" },
  ])("validates a review before writes", async (body) => {
    expect((await submit(body)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["LIVE", "ENDED"])("does not change %s auction outcomes", async (status) => {
    mocks.findUnique.mockResolvedValue({ id, userId: "seller", status, reviewRevision: 3 });
    expect((await submit()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a review of a stale version", async () => {
    expect((await submit({ revision: 2, decision: "APPROVED" })).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a racing seller edit, admin decision, or auction start without recording a decision", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await submit()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("supports existing upcoming listings with no revision", async () => {
    mocks.findUnique.mockResolvedValue({ id, userId: "seller", status: "UPCOMING", reviewRevision: null });
    expect((await submit({ revision: 0, decision: "APPROVED" })).status).toBe(200);
    expect(mocks.updateMany.mock.calls[0][0].where.OR).toContainEqual({ reviewRevision: { isSet: false } });
  });
  it("fails the transaction if the audit cannot be saved", async () => {
    mocks.create.mockRejectedValueOnce(new Error("private error"));
    const response = await submit();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not save this review. Please try again." });
  });
  it("returns a retryable conflict on a MongoDB transaction write conflict", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "P2034" });
    expect((await submit()).status).toBe(409);
  });
});
