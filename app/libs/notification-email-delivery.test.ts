import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auctionNow, makeListing } from "@/app/test/auction-fixtures";
import type { Notification } from "@prisma/client";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn(), claim: vi.fn(), prepare: vi.fn(), finish: vi.fn(), attempts: vi.fn(), listing: vi.fn(), send: vi.fn(), config: vi.fn(), warn: vi.fn() }));
vi.mock("./native-repositories", () => ({ getNativeRepositories: () => ({ notificationEmails: { candidates: mocks.findMany, find: mocks.findUnique, claim: mocks.claim, prepare: mocks.prepare, finish: mocks.finish, attempts: mocks.attempts, listing: mocks.listing } }) }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("./outbid-email", async (importOriginal) => ({ ...await importOriginal<typeof import("./outbid-email")>(), sendOutbidEmail: mocks.send, sendEmail: mocks.send, getEmailConfiguration: mocks.config }));
import { sendNotificationEmails } from "./notification-email-delivery";
import { buildOutbidEmail, EmailProviderError } from "./outbid-email";

let job: Notification & { user: { email: string | null; outbidEmailsEnabled: boolean; endingSoonEmailsEnabled?: boolean } };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(auctionNow);
  job = { id: "abcdef0123456789abcdef02", userId: "buyer", eventKey: "outbid:bid-1", kind: "bid", title: "You’ve been outbid", message: "Outbid", href: `/listing/${makeListing().id}#bids`, actionLabel: "Bid again", tone: "warning", createdAt: auctionNow, readAt: null,
    emailListingId: makeListing().id, emailStatus: "PENDING", emailAttempts: 0, emailNextAttemptAt: auctionNow, emailLockedUntil: null, emailLockToken: null, emailFirstAttemptAt: null, emailPayload: null, emailSentAt: null, emailProviderId: null, emailLastError: null,
    user: { email: "buyer@example.com", outbidEmailsEnabled: true } };
  mocks.config.mockReturnValue({ apiKey: "test-key", from: "alerts@example.com", origin: "https://bidlane.example" });
  mocks.findMany.mockResolvedValue([{ id: job.id }]);
  mocks.findUnique.mockImplementation(async () => ({ ...job }));
  mocks.claim.mockImplementation(async (_id, now, token) => {
    Object.assign(job, { emailStatus: "SENDING", emailLockToken: token, emailLockedUntil: new Date(now.getTime() + 120000), emailAttempts: job.emailAttempts + 1 });
    return { count: 1 };
  });
  mocks.prepare.mockImplementation(async (_id, _token, payload, now) => {
    Object.assign(job, { emailPayload: payload, emailFirstAttemptAt: now }); return { count: 1 };
  });
  mocks.finish.mockImplementation(async (_id, _token, data) => {
    Object.assign(job, { ...data, emailLockToken: null, emailLockedUntil: null }); return { count: 1 };
  });
  mocks.attempts.mockImplementation(async () => job.emailAttempts);
  mocks.listing.mockResolvedValue(makeListing({ highestBidderId: "other" }));
  mocks.send.mockResolvedValue("provider-id");
});
afterEach(() => vi.useRealTimers());

describe("durable outbid email delivery", () => {
  it("claims a job, freezes its payload before HTTP, and records provider acceptance", async () => {
    await expect(sendNotificationEmails()).resolves.toMatchObject({ checked: 1, sent: 1, failed: 0 });
    expect(mocks.claim).toHaveBeenCalledWith(job.id, auctionNow, expect.any(String));
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.send).toHaveBeenCalledWith("test-key", expect.objectContaining({ to: ["buyer@example.com"] }), job.id);
    expect(job).toMatchObject({ emailStatus: "SENT", emailAttempts: 1, emailProviderId: "provider-id", emailLockToken: null, emailSentAt: auctionNow });
  });

  it("does not send a job claimed by another worker", async () => {
    mocks.claim.mockResolvedValueOnce({ count: 0 });
    await expect(sendNotificationEmails()).resolves.toMatchObject({ checked: 0, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["disabled", "no-email", "read", "leading", "ended", "expired"])("skips a %s alert before its first delivery", async (scenario) => {
    if (scenario === "disabled") job.user.outbidEmailsEnabled = false;
    if (scenario === "no-email") job.user.email = null;
    if (scenario === "read") job.readAt = auctionNow;
    if (scenario === "leading") mocks.listing.mockResolvedValue(makeListing({ highestBidderId: "buyer" }));
    if (scenario === "ended") mocks.listing.mockResolvedValue(makeListing({ status: "ENDED" }));
    if (scenario === "expired") mocks.listing.mockResolvedValue(makeListing({ auctionEndsAt: auctionNow }));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled(); expect(job.emailStatus).toBe("SKIPPED");
  });

  it("sends a reminder to the leading bidder with its own content and idempotency key", async () => {
    job.eventKey = `ending-soon:${makeListing().id}`;
    job.user.outbidEmailsEnabled = false;
    mocks.listing.mockResolvedValue(makeListing({ highestBidderId: "buyer" }));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ sent: 1 });
    expect(mocks.send).toHaveBeenCalledWith("test-key", expect.objectContaining({ subject: "Auction ending soon — 2020 Porsche 911" }), `ending-soon/${job.id}`);
  });

  it.each(["disabled", "unwatched", "ended"])("skips %s reminders", async (scenario) => {
    job.eventKey = `ending-soon:${makeListing().id}`;
    if (scenario === "disabled") job.user.endingSoonEmailsEnabled = false;
    if (scenario === "unwatched") mocks.listing.mockResolvedValue(makeListing());
    if (scenario === "ended") mocks.listing.mockResolvedValue(makeListing({ status: "ENDED" }));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rechecks reminder relevance on retries without changing the frozen payload", async () => {
    job.eventKey = `ending-soon:${makeListing().id}`;
    mocks.listing.mockResolvedValue(makeListing({ watchersIds: ["buyer"] }));
    mocks.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    await sendNotificationEmails();
    const payload = structuredClone(job.emailPayload);
    await sendNotificationEmails();
    expect(mocks.send.mock.calls[1][1]).toEqual(payload);
    mocks.listing.mockResolvedValue(makeListing({ status: "ENDED" }));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ skipped: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("backs off temporary errors without losing the immutable request", async () => {
    mocks.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ retried: 1 });
    expect(job).toMatchObject({ emailStatus: "PENDING", emailNextAttemptAt: new Date(auctionNow.getTime() + 60000), emailLastError: "network_error" });
    const firstPayload = structuredClone(job.emailPayload);
    mocks.config.mockReturnValue({ apiKey: "new-key", from: "changed@example.com", origin: "https://changed.example" });
    await sendNotificationEmails();
    expect(mocks.send.mock.calls[1]).toEqual(["new-key", firstPayload, job.id]);
    expect(mocks.listing).toHaveBeenCalledTimes(1);
  });

  it("recovers a crash after provider acceptance using the same payload and key", async () => {
    const original = mocks.finish.getMockImplementation()!;
    mocks.finish.mockImplementation(async (...args) => { if (args[2].emailStatus === "SENT") throw new Error("database offline"); return original(...args); });
    await expect(sendNotificationEmails()).resolves.toMatchObject({ failed: 1 });
    expect(job.emailStatus).toBe("SENDING"); expect(job.emailPayload).not.toBeNull();
    const first = structuredClone(mocks.send.mock.calls[0]);
    mocks.finish.mockImplementation(original);
    await sendNotificationEmails();
    expect(mocks.send.mock.calls[1]).toEqual(first);
    expect(job.emailStatus).toBe("SENT");
  });

  it("limits retries and stops permanent failures", async () => {
    mocks.send.mockRejectedValueOnce(new EmailProviderError("validation_error", false));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ failed: 1, retried: 0 });
    expect(job.emailStatus).toBe("FAILED");
    job.emailAttempts = 7;
    mocks.send.mockRejectedValueOnce(new EmailProviderError("network_error", true));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ failed: 1, retried: 0 });
    expect(job.emailAttempts).toBe(8);
  });

  it("honors rate-limit delays and stops claiming more jobs in that batch", async () => {
    mocks.findMany.mockResolvedValue([{ id: job.id }, { id: "another-job" }]);
    mocks.send.mockRejectedValueOnce(new EmailProviderError("rate_limit_exceeded", true, 120000, true));
    await expect(sendNotificationEmails()).resolves.toMatchObject({ checked: 1, retried: 1, hasMore: true });
    expect(job.emailNextAttemptAt).toEqual(new Date(auctionNow.getTime() + 120000));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not resend after the provider's deduplication window", async () => {
    job.emailFirstAttemptAt = new Date(auctionNow.getTime() - 23 * 3600000);
    job.emailPayload = buildOutbidEmail({ from: "alerts@example.com", to: "buyer@example.com", vehicle: "Car", listingId: "car", origin: "https://bidlane.example" });
    await expect(sendNotificationEmails()).resolves.toMatchObject({ failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled(); expect(job.emailLastError).toBe("idempotency_window_expired");
  });

  it("does not claim records while configuration is missing", async () => {
    mocks.config.mockReturnValue(null);
    await expect(sendNotificationEmails()).rejects.toThrow("not configured");
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("does not send after losing its lease while preparing the payload", async () => {
    mocks.prepare.mockResolvedValueOnce({ count: 0 });
    await sendNotificationEmails();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("stops a recovery attempt after the claim limit or a recipient change", async () => {
    job.emailAttempts = 8;
    await expect(sendNotificationEmails()).resolves.toMatchObject({ failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    job.emailAttempts = 1;
    job.emailPayload = buildOutbidEmail({ from: "alerts@example.com", to: "old@example.com", vehicle: "Car", listingId: "car", origin: "https://bidlane.example" });
    await expect(sendNotificationEmails()).resolves.toMatchObject({ skipped: 1 });
    expect(job.emailLastError).toBe("recipient_changed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
