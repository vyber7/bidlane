import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOutbidEmail,
  EmailProviderError,
  getEmailConfiguration,
  sendOutbidEmail,
} from "./outbid-email";

const fetchMock = vi.fn();
const payload = () =>
  buildOutbidEmail({
    from: "BidLane <alerts@example.com>",
    origin: "https://bidlane.example",
    to: "buyer@example.com",
    vehicle: "2020 Porsche 911",
    listingId: "abcdef0123456789abcdef01",
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("outbid email", () => {
  it("escapes listing content and includes plain text, auction and preference links", () => {
    const email = buildOutbidEmail({
      from: "alerts@example.com",
      origin: "https://bidlane.example",
      to: "buyer@example.com",
      vehicle: '<img src=x onerror="bad()"> & Coupe',
      listingId: "car",
    });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x");
    expect(email.text).toContain("https://bidlane.example/listing/car#bids");
    expect(email.html).toContain(
      "https://bidlane.example/account/notifications",
    );
    expect(email.to).toEqual(["buyer@example.com"]);
  });

  it("requires server-side credentials, sender and a safe application origin", () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "alerts@example.com");
    vi.stubEnv("NEXTAUTH_URL", "https://bidlane.example/path");
    expect(getEmailConfiguration()).toEqual({
      apiKey: "test-key",
      from: "alerts@example.com",
      origin: "https://bidlane.example",
    });
    vi.stubEnv("NEXTAUTH_URL", "javascript:alert(1)");
    expect(getEmailConfiguration()).toBeNull();
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(getEmailConfiguration()?.origin).toBe("http://localhost:3000");
    vi.stubEnv("EMAIL_FROM", "");
    expect(getEmailConfiguration()).toBeNull();
  });

  it("posts to Resend with a stable per-notification idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "provider-id" }));
    await expect(
      sendOutbidEmail("test-key", payload(), "notification-id"),
    ).resolves.toBe("provider-id");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
          "Idempotency-Key": "outbid/notification-id",
        },
        body: JSON.stringify(payload()),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    [429, "rate_limit_exceeded", true, true],
    [503, "service_unavailable", true, false],
    [409, "concurrent_idempotent_requests", true, false],
    [409, "invalid_idempotent_request", false, false],
    [422, "validation_error", false, false],
    [401, "invalid_api_key", true, true],
  ])(
    "classifies %s / %s without exposing the provider's message",
    async (status, name, retryable, stopBatch) => {
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { name, message: "secret-key buyer@example.com" },
          { status, headers: { "Retry-After": "120" } },
        ),
      );
      await expect(
        sendOutbidEmail("test-key", payload(), "id"),
      ).rejects.toMatchObject({
        code: name,
        message: name,
        retryable,
        stopBatch,
        retryAfterMs: 120000,
      });
    },
  );

  it("retries network failures and ambiguous success responses", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      sendOutbidEmail("test-key", payload(), "id"),
    ).rejects.toBeInstanceOf(EmailProviderError);
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await expect(
      sendOutbidEmail("test-key", payload(), "id"),
    ).rejects.toMatchObject({
      retryable: true,
      code: "invalid_provider_response",
    });
  });
});
