import { beforeEach, describe, expect, it, vi } from "vitest";

// The watch command's rules and real-time updates are tested in
// app/libs/engagement-commands.test.ts. These cover parsing and HTTP mapping.
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), setWatch: vi.fn(), error: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.getCurrentUser }));
vi.mock("@/app/libs/engagement-commands", () => ({ setWatch: mocks.setWatch }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: mocks.error } }));

import { POST } from "./route";

const listingId = "abcdef0123456789abcdef01";

function request(body: unknown) {
  return new Request("http://localhost/api/update-watchlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@test.dev" });
  mocks.setWatch.mockImplementation(async ({ watching }: { watching: boolean }) => ({ ok: true, watching }));
});

describe("POST /api/update-watchlist", () => {
  it.each([[true], [false]])("records watching=%s for the signed-in user", async (watching) => {
    const response = await POST(request({ listingId, watching }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ listingId, watching });
    expect(mocks.setWatch).toHaveBeenCalledExactlyOnceWith({
      watcher: { id: "user-1", email: "user@test.dev" },
      listingId,
      watching,
    });
  });

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({ listingId, watching: true }))).status).toBe(401);
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it("requires an explicit desired watchlist state", async () => {
    const response = await POST(request({ listingId }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Watchlist state must be a boolean" });
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it.each(["bad-id", "g".repeat(24), "a".repeat(23), 123, null])("rejects listing ID %j before calling the command", async (listingId) => {
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid listing ID" });
    expect(mocks.setWatch).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", 404, "Listing not found"],
    ["busy", 503, "The listing is busy. Please try again."],
  ])("maps the %s rejection to %i", async (reason, status, error) => {
    mocks.setWatch.mockResolvedValue({ ok: false, reason });
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("keeps unexpected failures private and returns JSON", async () => {
    mocks.setWatch.mockRejectedValue(new SyntaxError("private database decoding details"));
    const response = await POST(request({ listingId, watching: true }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to update watchlist" });
    expect(mocks.error).toHaveBeenCalledWith("watchlist.update_failed", expect.any(SyntaxError), { userId: "user-1" });
  });
});
