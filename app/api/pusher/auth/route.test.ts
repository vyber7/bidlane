import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), authorize: vi.fn() }));
vi.mock("@/app/actions/getCurrentUser", () => ({ default: mocks.user }));
vi.mock("@/app/libs/pusher", () => ({ pusherServer: { authorizeChannel: mocks.authorize } }));
vi.mock("@/app/libs/logger", () => ({ logger: { error: vi.fn() } }));
import { POST } from "./route";
const authorize = (channel = "private-user-buyer", socket = "123.456") => POST(new Request("http://localhost/api/pusher/auth", { method: "POST", body: new URLSearchParams({ socket_id: socket, channel_name: channel }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "buyer" }); mocks.authorize.mockReturnValue({ auth: "signed" }); });
describe("private notification channels", () => {
  it("signs only the current account's channel", async () => {
    await expect((await authorize()).json()).resolves.toEqual({ auth: "signed" });
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith("123.456", "private-user-buyer");
  });
  it.each(["private-user-other", "user-buyer", "private-user-buyer-extra", "listing-123"])("rejects channel %s", async (channel) => {
    expect((await authorize(channel)).status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("requires authentication before parsing or authorizing", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await authorize()).status).toBe(401);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("rejects malformed requests and socket IDs", async () => {
    expect((await authorize("private-user-buyer", "bad")).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/pusher/auth", { method: "POST", body: "{}" }))).status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
