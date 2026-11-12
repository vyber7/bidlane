import { beforeEach, describe, expect, it, vi } from "vitest";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), claim: vi.fn(), upsert: vi.fn(), trigger: vi.fn() }));
vi.mock("./native-repositories", () => ({
  getNativeRepositories: () => ({ auctions: { reminderCandidates: mocks.findMany } }),
  withNativeTransaction: async (fn: (tx: unknown) => unknown) => fn({ auctions: { claimReminder: mocks.claim }, notifications: { insertOnce: mocks.upsert } }),
}));
vi.mock("./pusher", () => ({ pusherServer: { trigger: mocks.trigger } }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { queueEndingSoonReminders } from "./ending-soon-reminders";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([{ id: "auction" }]);
  mocks.claim.mockResolvedValue(makeListing({ watchersIds: ["watcher", "buyer", "seller", "watcher"], biddersIds: ["buyer"], highestBidderId: "leader" }));
});
describe("ending-soon reminders", () => {
  it("selects only unreminded live auctions in the final hour, including legacy missing fields", async () => {
    await expect(queueEndingSoonReminders(auctionNow)).resolves.toMatchObject({ queued: 1, failed: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith(auctionNow, new Date(auctionNow.getTime() + 3600000), 100);
    expect(mocks.upsert.mock.calls.map(([arg]) => arg.userId)).toEqual(["watcher", "buyer", "leader"]);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ eventKey: `ending-soon:${makeListing().id}`, emailListingId: makeListing().id, kind: "auction" }));
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.claim.mock.invocationCallOrder[0]);
  });
  it("does not create alerts when another worker claimed it or the auction ended", async () => {
    mocks.claim.mockResolvedValue(null);
    await expect(queueEndingSoonReminders(auctionNow)).resolves.toMatchObject({ skipped: 1, queued: 0 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("reports a failed transaction and continues processing other auctions", async () => {
    mocks.findMany.mockResolvedValue([{ id: "failed" }, { id: "ok" }]);
    mocks.upsert.mockRejectedValueOnce(new Error("database offline"));
    await expect(queueEndingSoonReminders(auctionNow)).resolves.toMatchObject({ checked: 2, queued: 1, failed: 1 });
  });
});
