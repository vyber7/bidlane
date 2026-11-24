import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { installFakeRealtime, type FakeRealtime } from "@/app/libs/realtime/testing";
import { POST } from "./route";
const authorize = (channel = "private-user-buyer", socket = "123.456") => POST(new Request("http://localhost/api/pusher/auth", { method: "POST", body: new URLSearchParams({ socket_id: socket, channel_name: channel }) }));
let realtime: FakeRealtime;
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "buyer" }); realtime = installFakeRealtime(); });
afterEach(() => realtime.uninstall());
describe("private notification channels", () => {
  it("rejects oversized authorization forms before signing", async () => {
    const response = await POST(new Request("http://localhost/api/pusher/auth", { method: "POST", body: new URLSearchParams({ socket_id: "123.456", channel_name: "x".repeat(4096) }) }));
    expect(response.status).toBe(413); expect(realtime.authorized).toEqual([]);
  });
  it("signs only the current account's channel", async () => {
    await expect((await authorize()).json()).resolves.toEqual({ auth: "signed:123.456:private-user-buyer" });
    expect(realtime.authorized).toEqual([{ socketId: "123.456", channel: "user:buyer" }]);
  });
  it.each(["private-user-other", "user-buyer", "private-user-buyer-extra", "listing-123"])("rejects channel %s", async (channel) => {
    expect((await authorize(channel)).status).toBe(403);
    expect(realtime.authorized).toEqual([]);
  });
  it("requires authentication before parsing or authorizing", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await authorize()).status).toBe(401);
    expect(realtime.authorized).toEqual([]);
  });
  it("rejects malformed requests and socket IDs", async () => {
    expect((await authorize("private-user-buyer", "bad")).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/pusher/auth", { method: "POST", body: "{}" }))).status).toBe(400);
    expect(realtime.authorized).toEqual([]);
  });
});
